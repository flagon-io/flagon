import type { RateLimitResult } from "./rate-limit.js";

/**
 * An IN-PROCESS fixed-window rate limiter for hot paths (OFREP evaluation).
 *
 * The Postgres-backed rateLimit() in ./rate-limit.ts is the right tool where a
 * count must hold across every serverless instance (auth brute-force, waitlist
 * spam) — but it costs a database round-trip per check. On the evaluation hot
 * path that would defeat the eval-cache: we'd trade four read queries for one
 * write query on every SDK call.
 *
 * So the hot path gets this instead: a per-instance counter kept in process
 * memory. It is a burst guardrail, not a precise global quota — under N warm
 * instances the effective ceiling is up to N × limit — but that is exactly what
 * a hot-path limiter needs (turn away runaway loops and abusive spikes cheaply,
 * before any work), and real DoS protection lives at the edge/CDN regardless.
 *
 * Windows are lazily reset on read, and stale keys are swept opportunistically
 * so a long-lived instance's map cannot grow without bound.
 */
type Window = { count: number; resetAt: number };

export type HotRateLimiter = {
  check: (key: string) => RateLimitResult;
};

const SWEEP_EVERY = 1024;

/**
 * Create a limiter allowing `limit` requests per `windowSeconds` per key.
 *
 * `now` is injectable so windows are deterministic under test; it defaults to
 * Date.now.
 */
export function createHotRateLimiter(opts: {
  limit: number;
  windowSeconds: number;
  now?: () => number;
}): HotRateLimiter {
  const { limit } = opts;
  const windowMs = Math.max(1, Math.floor(opts.windowSeconds)) * 1000;
  const now = opts.now ?? Date.now;
  const windows = new Map<string, Window>();
  let sinceSweep = 0;

  function sweep(nowMs: number) {
    for (const [k, w] of windows) {
      if (w.resetAt <= nowMs) windows.delete(k);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const nowMs = now();

      if (++sinceSweep >= SWEEP_EVERY) {
        sinceSweep = 0;
        sweep(nowMs);
      }

      let w = windows.get(key);
      if (!w || w.resetAt <= nowMs) {
        w = { count: 0, resetAt: nowMs + windowMs };
        windows.set(key, w);
      }
      w.count += 1;

      const ok = w.count <= limit;
      return {
        ok,
        limit,
        remaining: Math.max(0, limit - w.count),
        retryAfterSeconds: ok ? 0 : Math.max(1, Math.ceil((w.resetAt - nowMs) / 1000)),
      };
    },
  };
}
