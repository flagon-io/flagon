/**
 * A tiny in-process, single-flight TTL cache.
 *
 * - **TTL**: a cached value is served until `ttlMs` after it was loaded, then
 *   the next read reloads it. Staleness is therefore bounded by `ttlMs`.
 * - **Single-flight**: concurrent reads for the same key that miss share ONE
 *   in-flight load, so a burst of requests can't stampede the backing store.
 * - **Errors are never cached**: a failed load rejects the waiters and leaves
 *   the key empty, so the next read retries.
 * - **Invalidation is generation-guarded**: if a key is invalidated while a
 *   load for it is in flight, that load returns its value but does NOT store it,
 *   so a read racing a write can't cache a value that predates the write.
 *
 * This is process-local. Under multiple serverless instances each keeps its own
 * copy; correctness comes from the bounded TTL, not from cross-instance
 * coordination. `invalidate*` helps single-instance / self-host deployments and
 * dev feel instant; it is a best-effort speedup, not the correctness mechanism.
 */
export type TtlCache<T> = {
  get: (key: string) => Promise<T>;
  invalidate: (key: string) => void;
  invalidatePrefix: (prefix: string) => void;
  clear: () => void;
};

export function createTtlCache<T>(opts: {
  ttlMs: number;
  load: (key: string) => Promise<T>;
  now?: () => number;
}): TtlCache<T> {
  const { ttlMs, load } = opts;
  const now = opts.now ?? Date.now;
  const store = new Map<string, { data: T; expiresAt: number }>();
  const inflight = new Map<string, Promise<T>>();
  // Bumped on every invalidation. A load that spans an invalidation sees a
  // changed generation and declines to store its (now possibly stale) result.
  let generation = 0;

  function get(key: string): Promise<T> {
    const hit = store.get(key);
    if (hit && hit.expiresAt > now()) return Promise.resolve(hit.data);

    const pending = inflight.get(key);
    if (pending) return pending;

    const startGen = generation;
    const loading = (async () => {
      try {
        const data = await load(key);
        if (generation === startGen) {
          store.set(key, { data, expiresAt: now() + ttlMs });
        }
        return data;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, loading);
    return loading;
  }

  return {
    get,
    invalidate(key: string) {
      generation++;
      store.delete(key);
    },
    invalidatePrefix(prefix: string) {
      generation++;
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },
    clear() {
      generation++;
      store.clear();
    },
  };
}
