# Philosophy

## Start planning the use cases

E.g:

1. Whenever we receive a message on the message queue, we should store it using the message topic as key.
2. The HTTP service must serve the most recient value of every received message key.

To do so, we create two handlers for our business logic:

```typescript
// caches every incoming message
async function mqHandler(msg: TopicMessage) {
  await cache.set(msg.topic, msg.content)
}

// returns a cached value received from the MQ
async function httpRequestHandler(request: Request) {
  return new Response(cache.get(request.url.pathname))
}
```

That should be it, that is the whole business.

This specific example is trivial, but it works to make visible some common patterns that can explode in complexity making the whole service hard to test. In this particular case, testing may be complicated because: it assumes that a `cache` variable exists somehow in a "global" environment.

To make it a little bit more testable we are going to define simple _cache **component**_.

## What are components?

A component is an interface containing functions. In languages supporting classes, it could be an instance of a class. Returning plain objects with functions also works perfectly.

We are going to define a simple interface for our _cache component_.

⚠️ At this stage, we are not deciding which type of cache we are using. We only describe a protocol, an interface for it. That interface is the _component_.

```typescript
interface ICacheComponent {
  get(key: string): Promise<string>
  set(key: string, value: string): Promise<any>
}
```

Then we will provide the _cache component_ the previously created handlers:

```typescript
// caches every incoming message
async function mqHandler(cache: ICacheComponent, msg: TopicMessage) {
  //                     ^^^^^^^^^^^^^^^^^^^^^^
  await cache.set(msg.topic, msg.content)
}

// returns a cached value received from the MQ
async function httpRequestHandler(cache: ICacheComponent, request: Request) {
  //                              ^^^^^^^^^^^^^^^^^^^^^^
  return new Response(cache.get(request.url.pathname))
}
```

That is way more testable. `cache` is no longer a magical global variable. Now it would be trivial to test it with the tool of choice:

```typescript
test("should store messages", async function() {
  const cache = createCacheInMemoryMock()
  await mqHandler(cache, { topic: "/hi", content: "test" })
  assert(cache.get("/hi") == "test")
})

test("should serve stored messages", async function() {
  const cache = createCacheInMemoryMock()
  cache.set("/hi", "test123")
  const response = await httpRequestHandler(cache, new Request("/hi"))
  assert(response.body == "test123")
})

// helper function to mock the component
function createCacheInMemoryMock(): ICacheComponent {
  const map = new Map()
  return {
    get(key) {
      return map.get(key)
    },
    set(key, value) {
      map.set(key, value)
    },
  }
}
```

#### Take away

We have implemented all of our business logic without making _any_ technology decision. There is no mechanism in markdown to emphatize this sentence as much as I'd like, this is huge. The whole business logic is easyly testable and completely decoupled from bikeshedding discussions and libraries. We did not talk about which server we are going to use, we don't know if the MQ is Kafka, AMQP, SQS or UDP messages or messaging pidgeons.

## Ports

**Ports are the implementation of the components**. Is the result of invoking a function that returns the actual `cache` that we will pass to the functions.

Ports could be part of our program to begin with, and a good practice is to extract the ports into their own repository as soon as the API (the component) is stable. To enable other teams or projects to leverage the port.

## Adapters

Adapters are pure functions that transforms external data from ports into our internal usable representation `fn(rawPortData) -> ApplicationData`.

A good example is the adapters for Postgress queries. Every record returned by Postgres uses underscores, but depending on the conventions, we normally use camelCase for our records.

It is recommended that everything is well typed, and that our services have a cannonical representation of the data that does not change with the exposed APIs, and it is consistent no matter which port or component are we using. An example is the schema of a notification. It shouldn't matter whether the notification arrives from SNS, a message queue or UDP message. Or if it is encoded as JSON, XML or ProtocolBuffer. Our service should have a cannonical `Notification` type that is always consistent. To do that, we use the Adapters, from the hexagonal architecture. Adapters abstract us from the subtleties of every port and their protocols to have cannonical representations of our data.

## Controllers

The "glue" between all the other layers, orchestrating calls between pure business logic, adapters, and ports.

Controllers always receive an hydrated context containing components and parameters to call the business logic.

## Development approach

The goal of the initiative, is to enable docummented and consistent creation of services, using reusable pieces (components) in a seamlessly way while keeping the whole thing testable and maintainable. Often projects explode in complexity because they rely on mountains of constructs and abstraction patterns. While leveraging simple constructs like functions and records (ports) might make things simpler.

To create big systems the proposal goes as follows:

1. **Define the use cases of the microservice**:  
   E.g: React to messages, store the messages in a caché, expose the caché using HTTP endpoints.
2. **Create a set of well-known interfaces, the components.**  
   That way, you can defer the responsibilitiy of creating the `KafkaComponent` or `KafkaTestComponent` to the "kafka-team" and let them maintain the library and do what they do best.
3. **Put all the components in a typed record and pass it over to all the handlers.**  
   It works best if you also create specialized types or schemas for every specific handler. We will see an example of that later.
4. **Initialize the components at the begining.**  
   In my personal experience, this works best in an explicit piece of code, a function, to initialize the components. Otherwise you can leverage tools to do the same i.e. [stuartsierra/components](https://github.com/stuartsierra/component).
5. **Wire components together, focus on the business logic.**  
   Business logic is the most important part of any application or service you will ever create. This framework will remove you the load of dealing with technology decisions and will provide you and your team more time to focus on what matters the most.

### 1. Define the use cases of the microservice

This is on you. For our example, the use cases are:

1. Whenever we receive a message on the message queue, we should store it using the message topic as key.
2. The HTTP service must serve the most recient value of every received message key.

### 2. Create a set of well-known interfaces, the components

There are many approaches to do this, you could either create a library for common interfaces that is shared across your team's projects. Or define them manually. In this example, we are going to define the components in a file called `components.ts`

```typescript
// components.ts

// caché handling
interface ICacheComponent {
  get(key: string): Promise<string>
  set(key: string, value: string): Promise<any>
}

// a handler to consume queues
interface TopicMessage {
  topic: string
  content: string
}

interface IMessageQueue<Context> {
  onMessage(context: Context, handler: (context: Context, msg: TopicMessage) => void): void
}

// a simple handler for http requests
interface IHttpServer<Context> {
  onRequest(context: Context, handler: (context: Context, msg: Request) => Promise<Response>): void
}

// a configuration provider
interface IConfig {
  requireString(key: string): Promise<string>
  requireNumber(key: string): Promise<number>
}
```

### 3. Put all the components in a typed record (context) and pass it over to all the handlers

Keep this context record visible and available for other files, it will become handy, this context record describes all the components required and avaliable for your application

```typescript
type ApplicationContext = {
  config: IConfig
  cache: ICacheComponent
  mq: IMessageQueue<ApplicationContext>
  httpServer: IHttpServer<ApplicationContext>
  // logger
  // db
  // etc
}
```

### 4. Initialize the components at the begining

At the beginning of your application or testing environment, you should create all the components required by your application to work. Often, some components will depend on eachother, like the `config` component, it may be used by several other components to handle proper initialization. Or you may need to manually access it to configure i.e. the listening port of an HTTP server.

To do so, there are libraries to resolve graphs or inject dependencies.

Our approach is more manual and verbosic, simple functions handling the component creation are enough in most cases, and also very easy to debug and trace.

```typescript
// components.ts

// create the production components
export async function initializeComponents(): ApplicationContext {
  // initialize config component using the process environment variables
  const config: IConfig = createConfigProvider(process.env)

  // initialize HTTP server
  const httpServer: IHttpServer<ApplicationContext> = createHttpServer(await config.requireNumber("port"))

  // initialize message queue consumer
  const mq: IMessageQueue<ApplicationContext> = createMq(await config.requireString("mq_url"))

  // initialize in-memory cache
  const cache: ICacheComponent = createMemoryCache()
  // createRedisCache(await config.requireString('redis_url'))

  // return all the components for the app
  return {
    config,
    httpServer,
    mq,
    cache,
  } as ApplicationContext
}
```

### 5. Wire components together, focus on the business logic

Write the glue code using the components to achieve business results. We call the "wiring" part of our services _the controllers_, a familiar concept.

This framework is heavily inspired by Hexagonal Architecture, where the components instances are ports, and the business logic live in controllers, legeraging adapters + core logic.

The controllers connect several components together to achieve an use case. The first examples in this document were the controllers, the handler functions. Then we need to wire the handlers to the ports, and that process is called "wiring".

The controllers (handlers) will receive only the context they need. That makes testability easier when using static typing, because there is no need to pass unwanted or unused components to a handler.

```typescript
// handlers.ts

// subset of components for the mq handler
type MqHandlerContext = Pick<ApplicationContext, "cache">

// subset of components for the http handler
type HttpHandlerContext = Pick<ApplicationContext, "cache">

function mqHandler(components: MqHandlerContext, msg: TopicMessage) {
  // caches every incoming message
  await components.cache.set(msg.topic, msg.content)
}

function httpRequestHandler(components: HttpHandlerContext, request: Request) {
  // returns a cached value received from the MQ
  return new Response(components.cache.get(request.url.pathname))
}
```

Finally, some code is needed to create the components and wire the application

```typescript
// main.ts

// initialize and wire components
function initControllers(context: ApplicationContext) {
  context.mq.onMessage(context, mqHandler)
  context.httpServer.onRequest(context, httpRequestHandler)
}

// main entry point of our application
function main() {
  const context: ApplicationContext = await initializeComponents()
  initControllers(context)
}

// fail if some error is triggered during initialization
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

 <!--
## Service lifecycle

A service is a set of ports wired together. In practical means, the lifecycle of a service _should_ be reduced to:

1. **Create components**: instantiate the ports
2. **Wire the components together**: e.g, bind the HTTP request to the handlers. Bind the MQ message to the cache writer handler.
3. **Start the components**: start the lifecycle of the components by themselves: `http.listen()`, `mq.connect()`
4. **Shut down**: under some condition (like SIGTERM), gracefully stop the components and exit the process.

To simplify the lifecycle, we created an library `@well-known-components/interfaces` containing not only the most common components, but also Lifecycle helpers.
-->
