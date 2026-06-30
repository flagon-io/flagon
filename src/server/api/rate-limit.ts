/**
 * Per-token rate limiting for the management API. A fixed-window counter keyed by
 * token id. Only token-authenticated requests (PAT / org token / JWT minted from
 * one) are limited; first-party session requests are not. In-memory, so it's
 * per-instance — swap the store for Redis/DB if you run many instances and need a
 * shared budget. OFREP evaluation does not pass through here.
 */

import type { Principal } from '@/server/auth/principal';

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = Number(process.env.API_RATE_LIMIT ?? 600); // requests / minute / token

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitState {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, limit = DEFAULT_LIMIT, windowMs = WINDOW_MS): RateLimitState {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count++;
  // Opportunistic cleanup so the map can't grow without bound.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  return {
    ok: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
  };
}

/**
 * Returns a ready-to-send 429 Response when a token has exceeded its budget, or
 * null to proceed. Sessions (no tokenId) are never limited.
 */
export function principalRateLimit(principal: Principal): Response | null {
  if (!principal.tokenId) return null;
  const r = rateLimit(`tok:${principal.tokenId}`);
  if (r.ok) return null;

  const retryAfter = Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000));
  return new Response(JSON.stringify({ message: 'Rate limit exceeded. Slow down.' }), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'Retry-After': String(retryAfter),
      'RateLimit-Limit': String(r.limit),
      'RateLimit-Remaining': String(r.remaining),
      'RateLimit-Reset': String(retryAfter),
    },
  });
}
