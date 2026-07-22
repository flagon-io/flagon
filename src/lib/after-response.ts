import { after } from "next/server";

/**
 * Schedule best-effort work to run AFTER the response is sent.
 *
 * In a real request (serverless or the self-hosted Node server) this is Next's
 * after(), which extends the invocation via waitUntil so a fire-and-forget
 * write is still guaranteed to run once the invocation would otherwise freeze.
 * That is the property the ofrep hot path needs: usage attribution must not
 * block the response, but it must actually land.
 *
 * Outside a request scope - a unit test that imports a route handler and calls
 * it directly, or a script - after() throws (E468: called outside a request
 * scope). There is no invocation to extend there, so the task simply runs
 * inline, best-effort. That is exactly the old `void task()` behavior these
 * call sites had before adopting after(), so tests that drive a handler
 * directly keep working while production keeps the durability guarantee.
 *
 * The task is responsible for its own error handling; anything it rejects with
 * is swallowed so best-effort work can never surface as a request failure.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void Promise.resolve().then(task).catch(() => {});
  }
}
