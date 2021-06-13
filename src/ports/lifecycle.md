# Lifecycle

The `@well-known-components/interfaces` library not only define well-known-components, it exposes a `Lifecycle` namespace to help control any application built with the components.

```typescript
import { Lifecycle } from "@well-known-components/interfaces"

// Record of components
type Components = {
  console: { log(text: string): void }
}

// Context passed to all handlers, we always include the components here
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

  // wire the components, this is usually more meaningful than a console.log
  // i.e. routes are wired to the server here
  components.console.log("initializing")

  // start components
  await startComponents()
}

// initComponents role is to create BUT NOT START the components,
// this function is only called once by the Lifecycle manager
async function initComponents(): Promise<Components> {
  const console = await createConsoleComponent()

  return /*components*/ {
    console,
  }
}
```

## Lifecycle design

The main consideration for this approach was to _never_ create any top-level variable in our applications, to make testing easier. That, combined with highly complex servers, led us to centralize and write a piece of software (the Lifecycle manager) to deal with components and delicated processes like:

1. Control all components to gracefully shut down the application
2. Get useful information to respond to health checks
3. Avoid divergence in implementations that lead to maintainability issues

## Ordered startup sequence

1. First, `initComponents` is called.  
   In that async function we must create _but NOT start_ our components. To explain it in practical terms of an http-server component, creating the component means to expose the interface to wire the routes, and starting it is actually listening to the port and be ready to accept requests.
2. Second, `main` function is called.  
   The role of the `main` function is to wire components together before starting them. The wiring is the process in which we configure our application to react to events, http requests, kafka messages.
3. Third, inside the `main` function, the parameter `startComponents` is called.  
   This is the moment in which we connect the databases, the MQ adapters, start the http-server listener.
4. Forth, shut down.  
   By default, Lifecycle does not prevent any shutdown. That means our program will run handled by Node.js event loop. The unique case managed by Lifecycle is `SIGTERM`, a signal sent by many orchestrators to gracefully stop our process without losing data.
   In this case, the Lifecycle manager will call and await the `stop` method of every component.
