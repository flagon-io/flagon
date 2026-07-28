import * as Sentry from "@sentry/nextjs";

/**
 * Server instrumentation entrypoint (Next runs register() once per server
 * instance). We load the matching Sentry init for whichever runtime we're in,
 * and forward server-side render/route/action errors to Sentry via the
 * onRequestError hook. All of it is inert unless NEXT_PUBLIC_SENTRY_DSN is set.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
