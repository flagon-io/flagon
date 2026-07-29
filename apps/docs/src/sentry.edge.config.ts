import * as Sentry from "@sentry/nextjs";

/**
 * Sentry init for the edge runtime. Loaded by instrumentation.ts's register()
 * only when NEXT_RUNTIME === "edge". Inert unless the DSN is set.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}
