# http-server

Repository: [https://github.com/well-known-components/http-server](https://github.com/well-known-components/http-server)

The port library `@well-known-components/http-server` implements the interface [IHttpServerComponent](https://github.com/well-known-components/interfaces/blob/master/src/components/http-server.ts).

This implementation is based in Koa sources, it provides a small code footprint to create HTTP servers with a powerful async/await programming model.

As it is defined in the component, the port only exposes a function `use(handler)` and `setContext(context)`

```typescript
export interface IHttpServerComponent<Context extends object> {
  /**
   * Register a global handler
   */
  use: (handler: IHttpServerComponent.IRequestHandler<Context>) => void

  /**
   * Sets a context to be passed on to the handlers.
   */
  setContext(ctx: Context): void
}
```

### Creating the component

The function `createServerComponent` creates an HTTP http server for your application. It requires a `logs` and a `config` components to startup.

Check out the [example code in the template-server](https://github.com/well-known-components/template-server/blob/8489802c0b1e1d87965ffc6f9843b644d34f69d4/src/components.ts)

## IHttpServerComponent interface

One of the main points of using components and ports is that we can document the behavior of the component (`IHttpServerComponent`) instead of the port in particular. Enabling multiple implementations of the port maintaining the business logic untouched. Examples of different ports could be:

- This port to handle node.js http(s) servers
- A port to implement HTTP2/3 servers
- A port to handle AWS Lambda requests

## Hello world

This is a complete example of a server, although in a single file and not following the file conventions. It has everything to start a server and experiment with it.

Next examples will only contain handler code for clarity.

```typescript
import { IConfigComponent, IHttpServerComponent, ILoggerComponent, Lifecycle } from "@well-known-components/interfaces"
import { createConfigComponent } from "@well-known-components/env-config-provider"
import { createServerComponent } from "@well-known-components/http-server"
import { createLogComponent } from "@well-known-components/logger"

// Record of components
type Components = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<AppContext>
}

// Context passed to all handlers, we always include the components
// here
type AppContext = {
  components: Components
}

// Lifecycle.run manages the lifecycle of the application and components
// it is particularly useful for servers with many components with state
// like database connectors, servers, or batch jobs.
// It also handles POSIX signals like SIGTERM to gracefully stop the
// components
Lifecycle.run<Components>({ initComponents, main })

// main entry point of the application, it's role is to wire components
// together (controllers, handlers) and ultimately start the components
// by calling startComponents
async function main({ components, startComponents }: Lifecycle.EntryPointParameters<Components>) {
  const globalContext: AppContext = { components }

  // wire the server
  components.server.setContext(globalContext)

  components.server.use(async function logger(ctx, next) {
    // Log the response time of all the requests handled by this server
    console.time(ctx.url.toString())
    const response = await next()
    console.timeEnd(ctx.url.toString())
    return response
  })

  components.server.use(async function handler(ctx) {
    // Respond hello world
    return {
      status: 200,
      body: {
        json: true,
        text: "Hello world",
      },
    }
  })

  // start server and other components
  await startComponents()
}

// initComponents role is to create BUT NOT START the components,
// this function is only called once by the Lifecycle manager
async function initComponents(): Promise<Components> {
  const logs = createLogComponent()

  const config = createConfigComponent({
    HTTP_SERVER_PORT: "5000",
    HTTP_SERVER_HOST: "0.0.0.0",
  })

  const server = await createServerComponent<AppContext>({ logs, config }, {})

  return /*components*/ {
    logs,
    config,
    server,
  }
}
```

## Middlewares

Middlewares are called in the same order as they were passed to the server, and the next middleware is awaiteable. That makes possible and easy many configurations like pre-order calling, in-order and post-order.

```typescript
// function main()

// Log the response time of all the requests handled by this server
components.server.use(async function timeLogger(ctx, next) {
  // start measuring time
  console.time(ctx.url.toString())

  // get the actual response, calling the next middleware
  const response = await next()

  // measure total time and print to console
  console.timeEnd(ctx.url.toString())

  // return response from the middleware
  return response
})

components.server.use(async function handler(ctx, _nextMiddleware) {
  // although _nextMiddleware may exist, this handler simply returns
  // a response, therefore, the _nextMiddleware will never be called
  // and could be ommited from the signature

  // Respond hello world
  return {
    status: 200,
    body: {
      json: true,
      text: "Hello world",
    },
  }
})
```

## Routes

Since the http-server is overly-simplistic in its implementation, routes should be handled by the user, but the library also includes a `Router` class that can be used to create the handler middleware.

```typescript
// to keep things testable, it is recommended to return the router
// instead of binding it to the server directly
function createRouter() {
  const router = new Router<AppContext>()

  router.get("/users/:id", handleUserById)
  router.post("/users", handleCreateUser)

  return router
}

async function main({ components, startComponents }) {
  const globalContext: AppContext = { components }

  /// Wire the server
  components.server.setContext(globalContext)

  /// Maybe use some middlewares to log every request?
  //    components.server.use(globalLoggerInterceptor)

  /// Wire the server to the global router
  components.server.use(createRouter().middleware())

  /// Start server and other components
  await startComponents()
}
```

## Request object

The request follows the [WHATWG Fetch Request standard](https://fetch.spec.whatwg.org/#requests). And it is part of the context received by the handlers:

```typescript
type HttpContext<AppContext> = AppContext & {
  request: Request
  url: URL
}
```

## Responses

Same as Requests, responses derive from the [WHATWG Fetch Response standard](https://fetch.spec.whatwg.org/#responses). It is worth mentioning that in order to avoid many complications, both the `Response` and `ResponseInit` objects are accepted as valid responses.

There is one main addition: `.body` field, which was added by us to enable returning the body of the response.

```typescript
// WHATWG standard
interface StandardResponseInit {
  headers?: HeadersInit
  status?: number
  statusText?: string
}

// our implementation
type Response = StandardResponseInit & {
  body?: JsonBody | stream.Readable | Uint8Array | Buffer | string
}
```

As you can infer from the code, there are several supported response body types, some of them have default mime-types:

- `(no default content type)`: `Buffer`, `Uint8Array`, `ArrayBuffer`, `Node.Stream`
- `text/plain`: `string`
- `application/json`: anything else

## Handling FormData

Handling FormData is enabled by [third-party libraries like `Busboy`](https://www.npmjs.com/package/busboy)

```typescript
import Busboy from "busboy"

export async function handleFormData(ctx) {
  // in this record, we are going to store every form field as it is read
  // from the request.body stream
  const fields: Record<string, any> = {}

  // first, create a Busboy instance to read our stream
  const formDataParser = new Busboy({
    headers: {
      "content-type": ctx.request.headers.get("content-type"),
    },
  })

  // promise to detect when we finish
  const finished = new Promise((ok, err) => {
    formDataParser.on("error", err)
    formDataParser.on("finish", ok)
  })

  // every time a field is read, this function will be called
  formDataParser.on("field", function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
    fields[fieldname] = val
  })

  // lastly, send the input stream to Busboy to process
  ctx.request.body.pipe(formDataParser)

  // await until it finishes processing the input data
  await finished

  // respond
  return {
    status: 201,
    body: {
      fields,
    },
  }
}
```

## Cookies

To keep things simple and to not "glue" the batteries, cookies are not part of this implementation. Same as FormData handling.

To handle cookies you may write your own code or use third party libraries like:

- https://www.npmjs.com/package/tough-cookie
- https://www.npmjs.com/package/simple-cookie
- https://www.npmjs.com/package/cookie

```typescript
import cookie from "cookie" // https://www.npmjs.com/package/cookie

async function handler(ctx) {
  var cookies = cookie.parse(ctx.request.headers.get("cookie") || "")

  // do something with cookies

  return {
    status: 200,
    headers: {
      "Set-Cookie": cookie.serialize(name, "value", opts),
    },
  }
}
```
