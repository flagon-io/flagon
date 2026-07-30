import type { Context } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { jsonError } from "./http.js";
import { logger } from "./logger.js";

/**
 * A fixed-window request limiter, backed by one atomic upsert on the
 * `rate_limits` table (see db/schema). Serverless-safe: the count lives in
 * Postgres, not process memory, so it holds across cold starts and across every
 * concurrent function instance.
 *
 * Each check inserts the key at count 1, or — if the row exists — either resets
 * to 1 (the window has elapsed) or increments, in a single statement so
 * concurrent requests can't race the counter. Keys are opaque and
 * caller-namespaced (e.g. `waitlist:<ip>`), so different limits never collide.
 *
 * It FAILS OPEN on any error: a limiter is a guardrail, not a gate, and a
 * database hiccup must never take down the endpoint it is protecting.
 */
export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Prune rate-limit rows whose window ended long ago. A key past its window is
 * treated as fresh on next use, so old rows carry no meaning — without a sweep
 * the table grows one row per distinct key (every `sdk-fail:<ip>`, etc.) forever.
 * Best-effort and self-contained: no external cron required (works self-hosted),
 * and callable directly if you'd rather drive it from a scheduled job.
 */
export async function sweepRateLimits(olderThanSeconds = 86_400): Promise<number> {
  const cutoff = Math.max(60, Math.floor(olderThanSeconds));
  try {
    const res = (await db.execute(
      sql.raw(
        `DELETE FROM rate_limits WHERE window_start < now() - interval '${cutoff} seconds'`,
      ),
    )) as unknown as { count?: number };
    return res?.count ?? 0;
  } catch (err) {
    logger.warn("rate limit sweep failed", { err });
    return 0;
  }
}

// Fire the sweep on ~1 in 500 checks, without awaiting it, so the table stays
// bounded automatically: busier instances (more keys) sweep more often.
function maybeSweep(): void {
  if (Math.random() < 0.002) void sweepRateLimits();
}

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { key, limit } = opts;
  maybeSweep();
  // Trusted integer from our own call sites (never user input), so inlining it
  // into the interval literal is safe and sidesteps parameter-type ambiguity.
  const windowSeconds = Math.max(1, Math.floor(opts.windowSeconds));
  const expired = sql.raw(
    `rate_limits.window_start < now() - interval '${windowSeconds} seconds'`,
  );

  try {
    const rows = (await db.execute(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${key}, 1, now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN ${expired} THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN ${expired} THEN now() ELSE rate_limits.window_start END
      RETURNING count, extract(epoch from window_start) AS window_epoch
    `)) as unknown as Array<{
      count: number | string;
      window_epoch: number | string;
    }>;

    const row = rows[0];
    if (!row) return allow(limit);

    const count = Number(row.count);
    const resetAtSec = Number(row.window_epoch) + windowSeconds;
    const retryAfterSeconds = Math.max(
      0,
      Math.ceil(resetAtSec - Date.now() / 1000),
    );

    return {
      ok: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds: count <= limit ? 0 : retryAfterSeconds,
    };
  } catch (err) {
    logger.warn("rate limit check failed; allowing request", { err, key });
    return allow(limit);
  }
}

function allow(limit: number): RateLimitResult {
  return { ok: true, limit, remaining: limit, retryAfterSeconds: 0 };
}

export type ReserveResult = {
  /** How many of the requested `amount` fell within the limit (0 = blocked). */
  granted: number;
  limit: number;
  /** When the current window ends, in epoch milliseconds. */
  resetAtMs: number;
  retryAfterSeconds: number;
};

/**
 * Atomically claim up to `amount` requests against a windowed limit in ONE
 * round-trip, returning how many were within the limit. This is the durable
 * primitive behind the eval hot-path limiter: a caller reserves a small batch,
 * spends it locally, and only comes back when the batch is exhausted, so a
 * high-QPS key costs ~one database write per `amount` evaluations instead of one
 * per evaluation, while the count still holds across every serverless instance.
 *
 * Fixed window, atomic (concurrent reservers can't race the counter), and FAILS
 * OPEN: on any database error it grants the whole batch, so a hiccup slows the
 * limiter, never the endpoint it protects.
 */
export async function reserveRateLimit(opts: {
  key: string;
  amount: number;
  limit: number;
  windowSeconds: number;
}): Promise<ReserveResult> {
  const { key, limit } = opts;
  maybeSweep();
  const amount = Math.max(1, Math.floor(opts.amount));
  const windowSeconds = Math.max(1, Math.floor(opts.windowSeconds));
  const expired = sql.raw(
    `rate_limits.window_start < now() - interval '${windowSeconds} seconds'`,
  );

  try {
    const rows = (await db.execute(sql`
      INSERT INTO rate_limits (key, count, window_start)
      VALUES (${key}, ${amount}, now())
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN ${expired} THEN ${amount} ELSE rate_limits.count + ${amount} END,
        window_start = CASE WHEN ${expired} THEN now() ELSE rate_limits.window_start END
      RETURNING count, extract(epoch from window_start) AS window_epoch
    `)) as unknown as Array<{
      count: number | string;
      window_epoch: number | string;
    }>;

    const row = rows[0];
    if (!row) return grantAll(amount, limit, windowSeconds);

    const count = Number(row.count);
    // The count before this reservation; anything up to `limit` is grantable.
    const before = count - amount;
    const granted = Math.max(0, Math.min(amount, limit - before));
    const resetAtMs = (Number(row.window_epoch) + windowSeconds) * 1000;
    const retryAfterSeconds =
      granted > 0 ? 0 : Math.max(1, Math.ceil(resetAtMs / 1000 - Date.now() / 1000));

    return { granted, limit, resetAtMs, retryAfterSeconds };
  } catch (err) {
    logger.warn("rate limit reservation failed; granting locally", { err, key });
    return grantAll(amount, limit, windowSeconds);
  }
}

function grantAll(amount: number, limit: number, windowSeconds: number): ReserveResult {
  return {
    granted: amount,
    limit,
    resetAtMs: Date.now() + windowSeconds * 1000,
    retryAfterSeconds: 0,
  };
}

/**
 * Send the standard 429 for a tripped limit: a JSON error in the API's usual
 * envelope, plus `Retry-After` and `RateLimit-*` headers so clients can back
 * off intelligently.
 */
export function tooManyRequests(c: Context, result: RateLimitResult) {
  c.header("Retry-After", String(result.retryAfterSeconds));
  c.header("RateLimit-Limit", String(result.limit));
  c.header("RateLimit-Remaining", String(result.remaining));
  return jsonError(
    c,
    429,
    "Too many requests. Slow down and try again shortly.",
  );
}
