import type { RateLimitResult, ReserveResult } from "./rate-limit.js";

type ReserveFn = (opts: {
  key: string;
  amount: number;
  limit: number;
  windowSeconds: number;
}) => Promise<ReserveResult>;

// The real reserve is loaded lazily on first use so importing this module (e.g.
// from a unit test that injects its own reserve) does not pull in the database
// client, which fails fast when no connection string is set.
let cachedReserve: ReserveFn | null = null;
const defaultReserve: ReserveFn = async (opts) => {
  if (!cachedReserve) {
    cachedReserve = (await import("./rate-limit.js")).reserveRateLimit;
  }
  return cachedReserve(opts);
};

/**
 * A durable, cross-instance rate limiter for the OFREP evaluation hot path.
 *
 * The enforcement lives in Postgres (the `rate_limits` table), NOT in process
 * memory, so the ceiling holds across every serverless instance and survives
 * cold starts. There is no dependence on an edge/CDN/WAF: the platform's own
 * database is the shared counter.
 *
 * To keep the hot path cheap it uses LOCAL TOKEN RESERVATION: rather than a
 * database write per evaluation, an instance reserves a small batch of tokens in
 * one atomic round-trip and spends them from memory, only returning to the
 * database when the batch runs out. So a key doing thousands of evals a minute
 * costs ~one write per `chunk` evals, not one per eval, while the global count
 * is still authoritative. The trade-off is bounded over-count: an instance can
 * reserve up to `chunk` tokens it never spends, which is negligible against an
 * abuse-scale limit.
 *
 * When a reservation comes back empty the key is marked blocked for the rest of
 * the window and served straight from memory, so a key under active abuse costs
 * no further database work, exactly when protecting the database matters most.
 */
type Buffer = { resetAtMs: number; remaining: number; blocked: boolean };

export type DurableEvalLimiter = {
  check: (key: string, limitOverride?: number) => Promise<RateLimitResult>;
};

const SWEEP_EVERY = 1024;

export function createDurableEvalLimiter(opts: {
  limit: number;
  windowSeconds: number;
  /** How many tokens to reserve per database round-trip. */
  chunk: number;
  /** Injectable for tests; defaults to Date.now. */
  now?: () => number;
  /** Injectable for tests; defaults to the Postgres-backed reserve. */
  reserve?: ReserveFn;
}): DurableEvalLimiter {
  const { limit, windowSeconds } = opts;
  const chunk = Math.max(1, Math.floor(opts.chunk));
  const now = opts.now ?? Date.now;
  const reserve = opts.reserve ?? defaultReserve;
  const buffers = new Map<string, Buffer>();
  let sinceSweep = 0;

  function sweep(t: number) {
    for (const [k, b] of buffers) if (b.resetAtMs <= t) buffers.delete(k);
  }

  const denied = (
    t: number,
    resetAtMs: number,
    effLimit: number,
    retryAfterSeconds?: number,
  ): RateLimitResult => ({
    ok: false,
    limit: effLimit,
    remaining: 0,
    retryAfterSeconds:
      retryAfterSeconds && retryAfterSeconds > 0
        ? retryAfterSeconds
        : Math.max(1, Math.ceil((resetAtMs - t) / 1000)),
  });

  return {
    async check(key: string, limitOverride?: number): Promise<RateLimitResult> {
      // Per-call limit so the ceiling can vary by plan (a tighter Hobby fair-use
      // limit vs the paid default) while one limiter instance serves every key. A
      // key's plan is stable, so its effective limit is stable across the window.
      const effLimit = limitOverride ?? limit;
      const t = now();
      if (++sinceSweep >= SWEEP_EVERY) {
        sinceSweep = 0;
        sweep(t);
      }

      const buf = buffers.get(key);
      if (buf && buf.resetAtMs > t) {
        // Spend a locally-held token: the common case, no database round-trip.
        if (buf.remaining > 0) {
          buf.remaining -= 1;
          return { ok: true, limit: effLimit, remaining: buf.remaining, retryAfterSeconds: 0 };
        }
        // Known blocked for this window: turn away from memory, no round-trip.
        if (buf.blocked) return denied(t, buf.resetAtMs, effLimit);
        // Buffer drained but not blocked: reserve another batch below.
      }

      const res = await reserve({ key: `eval:${key}`, amount: chunk, limit: effLimit, windowSeconds });
      const next: Buffer = {
        resetAtMs: res.resetAtMs,
        remaining: res.granted,
        blocked: res.granted === 0,
      };
      buffers.set(key, next);

      if (next.remaining > 0) {
        next.remaining -= 1;
        return { ok: true, limit: effLimit, remaining: next.remaining, retryAfterSeconds: 0 };
      }
      return denied(t, res.resetAtMs, effLimit, res.retryAfterSeconds);
    },
  };
}
