import * as Sentry from "@sentry/nextjs";

/**
 * Server instrumentation entrypoint (Next runs register() once per server
 * instance). We load the matching Sentry init for whichever runtime we're in,
 * and forward server-side render/route errors to Sentry via onRequestError. All
 * inert unless NEXT_PUBLIC_SENTRY_DSN is set.
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
