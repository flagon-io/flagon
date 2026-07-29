import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side Sentry init. Runs before React hydrates. Inert unless the DSN is
 * set. onRouterTransitionStart feeds client navigations to Sentry as tracing.
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

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
