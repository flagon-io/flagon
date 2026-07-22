import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { uuidv7 } from "./uuidv7";

/**
 * A shared fixed-window rate limiter, on top of the rate_limits table that
 * BetterAuth already uses (and that the cleanup cron already trims).
 *
 * DB-backed, not in-memory, on purpose: the app runs as many stateless
 * functions, so a per-process counter would let each one grant the full budget
 * and the real ceiling would be limit x instances. One atomic upsert against a
 * shared row is the only counter every instance sees.
 *
 * Fixed window rather than a token bucket: it is one statement, needs no
 * background refill, and for abuse prevention - which is the job here, not
 * fair-share shaping - "no more than N in any 60s window" is exactly the
 * guarantee wanted. Keys are caller-namespaced (e.g. "exposures:<orgId>") so
 * different limiters never collide, and so they never collide with BetterAuth's
 * own IP/path keys.
 *
 * Best-effort by contract: a limiter that throws must not take the request down
 * with it. Callers treat a failure as "allow" - a rate limiter is a guardrail,
 * not a gate, and failing it closed would turn a transient database blip into an
 * outage of the thing it protects.
 */
export type RateLimitResult = {
  ok: boolean;
  /** Requests left in the current window (0 when over). */
  remaining: number;
  /** Seconds until the window resets, for a Retry-After header. */
  retryAfterSeconds: number;
};

export async function rateLimit(input: {
  /** Caller-namespaced identity, e.g. `exposures:<orgId>`. */
  key: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  now?: number;
}): Promise<RateLimitResult> {
  const now = input.now ?? Date.now();
  const windowMs = input.windowSeconds * 1000;

  // One statement does the whole decision atomically: start a fresh window if
  // the stored one has elapsed, otherwise increment. last_request holds the
  // window START (not the last hit), so the reset is a clean fixed window.
  const rows = (await db.execute(sql`
    INSERT INTO rate_limits (id, key, count, last_request)
    VALUES (${uuidv7()}, ${input.key}, 1, ${now})
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN ${now} - rate_limits.last_request >= ${windowMs} THEN 1
        ELSE rate_limits.count + 1
      END,
      last_request = CASE
        WHEN ${now} - rate_limits.last_request >= ${windowMs} THEN ${now}
        ELSE rate_limits.last_request
      END
    RETURNING count, last_request
  `)) as unknown as { count: number; last_request: number | string }[];

  const count = Number(rows[0]?.count ?? 1);
  const windowStart = Number(rows[0]?.last_request ?? now);
  const elapsed = now - windowStart;

  return {
    ok: count <= input.limit,
    remaining: Math.max(0, input.limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((windowMs - elapsed) / 1000)),
  };
}
