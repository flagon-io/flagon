import * as Sentry from "@sentry/node";
import { sentryEnabled } from "../instrument.js";
import { logger } from "./logger.js";

/**
 * Alerting seam for BACKGROUND failures — the ones that never reach the
 * request-boundary onError that feeds Sentry (see index.ts).
 *
 * The billing sweep, the webhook handlers, and the report path deliberately
 * SWALLOW their failures so one org (or one report row) can't block the batch.
 * That isolation is correct, but it also means a repeated Stripe failure or a
 * cron gap — the only ways real revenue is silently dropped — produce nothing
 * but a stdout line nobody watches. Route those swallowed failures here so they
 * become a visible Sentry signal while keeping the structured-log record.
 *
 * Inert to Sentry when SENTRY_DSN is unset (local dev, the test suite, and any
 * self-host without a DSN): the log line is always written, and nothing is sent
 * anywhere. Turning Sentry on is purely an env change (see instrument.ts).
 */
type Context = Record<string, unknown>;

/** Report a swallowed background error to Sentry AND the structured log. */
export function captureError(message: string, err: unknown, context?: Context) {
  logger.error(message, { err, ...context });
  if (sentryEnabled) {
    Sentry.captureException(err, { extra: { message, ...context } });
  }
}

/**
 * Report a background condition that isn't an exception but still needs eyes —
 * e.g. a report row that has aged past its expected send window. Warning level.
 */
export function captureWarning(message: string, context?: Context) {
  logger.warn(message, context);
  if (sentryEnabled) {
    Sentry.captureMessage(message, { level: "warning", extra: context });
  }
}

/**
 * Flush queued Sentry events at a background boundary (the cron sweep, the
 * webhook) where the serverless function can freeze the instant it responds,
 * dropping anything still buffered. No-op and instant when Sentry is disabled.
 */
export async function flushMonitoring(ms = 2000): Promise<void> {
  if (sentryEnabled) await Sentry.flush(ms);
}
