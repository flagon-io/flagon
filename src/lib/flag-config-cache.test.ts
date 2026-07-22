import { describe, expect, it, vi } from "vitest";
import {
  createFlagConfigCache,
  type FlagConfig,
} from "./flag-config-cache.server";

const config = (keys: string[]): FlagConfig => ({
  flags: keys.map((key) => ({ key })) as FlagConfig["flags"],
  segments: [],
});

/**
 * A cache harness with a controllable clock and captured subscription, so the
 * caching and invalidation semantics are exercised without a database or a live
 * LISTEN connection.
 */
function harness(
  overrides: Partial<{
    fetch: (orgId: string) => Promise<FlagConfig>;
    subscribe: (orgId: string, onChange: () => void) => Promise<() => void>;
    ttlMs: number;
  }> = {},
) {
  let now = 1000;
  const invalidators = new Map<string, () => void>();
  const fetch = vi.fn(
    overrides.fetch ?? ((orgId: string) => Promise.resolve(config([orgId]))),
  );
  const subscribe = vi.fn(
    overrides.subscribe ??
      ((orgId: string, onChange: () => void) => {
        invalidators.set(orgId, onChange);
        return Promise.resolve(() => invalidators.delete(orgId));
      }),
  );
  const cache = createFlagConfigCache({
    fetch,
    subscribe,
    ttlMs: overrides.ttlMs ?? 30_000,
    now: () => now,
  });
  return {
    cache,
    fetch,
    subscribe,
    advance: (ms: number) => {
      now += ms;
    },
    /** Fire the LISTEN-channel invalidation the way pg_notify would. */
    invalidate: (orgId: string) => invalidators.get(orgId)?.(),
  };
}

describe("flag config cache", () => {
  it("serves a warm entry without re-reading the database", async () => {
    const h = harness();
    const first = await h.cache.load("org");
    const second = await h.cache.load("org");
    expect(second).toBe(first);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it("coalesces a stampede of concurrent misses into one read", async () => {
    const h = harness();
    const results = await Promise.all([
      h.cache.load("org"),
      h.cache.load("org"),
      h.cache.load("org"),
    ]);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[2]);
  });

  it("subscribes to invalidation exactly once per org", async () => {
    const h = harness();
    await h.cache.load("org");
    await h.cache.load("org");
    await h.cache.load("other");
    expect(h.subscribe).toHaveBeenCalledTimes(2);
    expect(h.subscribe.mock.calls.map((call) => call[0])).toEqual([
      "org",
      "other",
    ]);
  });

  it("re-reads after a configuration-changed notification", async () => {
    const h = harness();
    await h.cache.load("org");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.invalidate("org");
    await h.cache.load("org");
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("re-reads after the TTL backstop expires", async () => {
    const h = harness({ ttlMs: 10_000 });
    await h.cache.load("org");
    h.advance(9_999);
    await h.cache.load("org");
    expect(h.fetch).toHaveBeenCalledTimes(1);
    h.advance(2);
    await h.cache.load("org");
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("clears one org or every org on demand", async () => {
    const h = harness();
    await h.cache.load("a");
    await h.cache.load("b");
    h.cache.clear("a");
    await h.cache.load("a");
    await h.cache.load("b");
    expect(h.fetch).toHaveBeenCalledTimes(3); // a (miss), b (miss), a (re-read)
    h.cache.clear();
    await h.cache.load("a");
    await h.cache.load("b");
    expect(h.fetch).toHaveBeenCalledTimes(5);
  });

  it("never caches a failed read", async () => {
    let attempt = 0;
    const h = harness({
      fetch: (orgId) => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("db down"))
          : Promise.resolve(config([orgId]));
      },
    });
    await expect(h.cache.load("org")).rejects.toThrow("db down");
    // The rejected entry is evicted, so the next call retries rather than
    // replaying the failure from cache.
    const recovered = await h.cache.load("org");
    expect(recovered.flags[0].key).toBe("org");
    expect(attempt).toBe(2);
  });

  it("keeps serving with the TTL backstop when subscription fails", async () => {
    const h = harness({
      subscribe: () => Promise.reject(new Error("no listener")),
    });
    // A subscription failure must not reject the load.
    const first = await h.cache.load("org");
    expect(first.flags[0].key).toBe("org");
    // Let the (fire-and-forget) subscription rejection roll back its claim.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The claim was rolled back, so a later miss retries the subscription.
    h.advance(30_001);
    await h.cache.load("org");
    expect(h.subscribe).toHaveBeenCalledTimes(2);
  });
});
