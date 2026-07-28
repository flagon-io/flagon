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

export async function rateLimit(opts: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const { key, limit } = opts;
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
