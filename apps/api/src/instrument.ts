import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry ONCE, as early as possible — this module is the very first
 * import in the API entrypoint (index.ts), before the app and the libraries
 * Sentry auto-instruments (http, postgres) are pulled in.
 *
 * Entirely inert unless `SENTRY_DSN` is set: local dev, the test suite, and any
 * deploy without the DSN behave exactly as before, and nothing is sent
 * anywhere. Drop the DSN into the environment to turn it on — no code change.
 */
const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.SENTRY_ENVIRONMENT ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      "development",
    // Off by default — turn tracing on deliberately once we know the volume we
    // want to pay for. Error capture does not depend on it.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

/** Whether Sentry is actually reporting, so callers can skip the flush cost. */
export const sentryEnabled = Boolean(dsn);
