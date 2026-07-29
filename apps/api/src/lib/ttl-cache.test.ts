import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "./ttl-cache.js";

describe("createTtlCache", () => {
  it("serves a cached value within the TTL without reloading", async () => {
    let t = 0;
    const load = vi.fn(async (k: string) => `v:${k}`);
    const cache = createTtlCache({ ttlMs: 100, load, now: () => t });

    expect(await cache.get("a")).toBe("v:a");
    expect(await cache.get("a")).toBe("v:a");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads once the TTL has elapsed", async () => {
    let t = 0;
    const load = vi.fn(async (k: string) => `v:${k}@${t}`);
    const cache = createTtlCache({ ttlMs: 100, load, now: () => t });

    expect(await cache.get("a")).toBe("v:a@0");
    t = 100; // exactly at expiry -> reload
    expect(await cache.get("a")).toBe("v:a@100");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent misses into a single load (single-flight)", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(
      () => new Promise<string>((r) => (resolve = r)),
    );
    const cache = createTtlCache({ ttlMs: 100, load, now: () => 0 });

    const p1 = cache.get("a");
    const p2 = cache.get("a");
    resolve("shared");

    expect(await p1).toBe("shared");
    expect(await p2).toBe("shared");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed loads", async () => {
    let t = 0;
    let attempt = 0;
    const load = vi.fn(async () => {
      attempt++;
      if (attempt === 1) throw new Error("boom");
      return "ok";
    });
    const cache = createTtlCache({ ttlMs: 100, load, now: () => t });

    await expect(cache.get("a")).rejects.toThrow("boom");
    expect(await cache.get("a")).toBe("ok"); // retried, not a cached error
  });

  it("invalidatePrefix evicts matching keys", async () => {
    const load = vi.fn(async (k: string) => `v:${k}`);
    const cache = createTtlCache({ ttlMs: 10_000, load, now: () => 0 });

    await cache.get("org1:env1");
    await cache.get("org1:env2");
    await cache.get("org2:env1");
    expect(load).toHaveBeenCalledTimes(3);

    cache.invalidatePrefix("org1:");
    await cache.get("org1:env1"); // reload
    await cache.get("org2:env1"); // still cached
    expect(load).toHaveBeenCalledTimes(4);
  });

  it("does not store a load that spans an invalidation", async () => {
    let resolve!: (v: string) => void;
    const load = vi.fn(
      () => new Promise<string>((r) => (resolve = r)),
    );
    const cache = createTtlCache({ ttlMs: 10_000, load, now: () => 0 });

    const p = cache.get("a"); // load in flight
    cache.invalidate("a"); // write happens mid-load
    resolve("stale-read");
    expect(await p).toBe("stale-read"); // caller still gets the value

    // ...but it was not cached, so the next read reloads.
    const p2 = cache.get("a");
    resolve("fresh");
    expect(await p2).toBe("fresh");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
