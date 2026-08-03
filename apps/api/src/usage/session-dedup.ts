/**
 * A pure, process-local session-dedup set for exposures default-on. No env, no I/O,
 * so it is trivially unit-testable; the billing wiring lives in auto-expose.ts.
 *
 * Best-effort and per-instance, exactly like the eval-cache and the rate limiter: a
 * cross-instance or post-restart duplicate is bounded and reads as a genuinely
 * separate session. `markSeen` returns true the first time a key is seen within the
 * window (bill it) and false while it is still in-window (dedup).
 */
export type SessionDedup = {
  markSeen: (key: string, nowMs: number) => boolean;
  size: () => number;
  clear: () => void;
};

export function createSessionDedup(ttlMs: number, maxEntries = 200_000): SessionDedup {
  const seen = new Map<string, number>();
  let lastSweepMs = 0;

  function sweep(nowMs: number): void {
    // Hard bound first: if we somehow blow the cap, drop everything (a brief loss of
    // dedup over-bills slightly, never under-serves) rather than grow unbounded.
    if (seen.size > maxEntries) {
      seen.clear();
      lastSweepMs = nowMs;
      return;
    }
    if (nowMs - lastSweepMs < 60_000) return;
    lastSweepMs = nowMs;
    for (const [k, exp] of seen) if (exp <= nowMs) seen.delete(k);
  }

  return {
    markSeen(key, nowMs) {
      const exp = seen.get(key);
      if (exp !== undefined && exp > nowMs) return false; // seen this session → duplicate
      seen.set(key, nowMs + ttlMs);
      sweep(nowMs);
      return true;
    },
    size: () => seen.size,
    clear: () => seen.clear(),
  };
}
