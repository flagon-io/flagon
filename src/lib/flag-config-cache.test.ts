import { describe, expect, it, vi } from "vitest";
import { buildArtifact } from "./config-artifact";
import type { ConfigStore } from "./config-store";
import {
  createFlagConfigCache,
  type FlagConfig,
} from "./flag-config-cache.server";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const config = (keys: string[]): FlagConfig => ({
  flags: keys.map((key) => ({
    id: key,
    organizationId: "org",
    key,
    name: key,
    description: null,
    type: "boolean",
    variants: [{ key: "on", value: true }],
    defaultVariant: "on",
    rules: [],
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  })) as unknown as FlagConfig["flags"],
  segments: [],
});

/** The envelope bytes a real store would hold for a config. */
const artifactBody = (orgId: string, c: FlagConfig) =>
  buildArtifact(orgId, c).body;

/** In-memory ConfigStore with conditional-read semantics, standing in for R2. */
function fakeStore() {
  const objects = new Map<string, { body: string; etag: string }>();
  let counter = 0;
  const store: ConfigStore = {
    name: "fake",
    read: vi.fn(async (orgId: string, etag: string | null) => {
      const object = objects.get(orgId);
      if (!object) return { status: "absent" as const };
      if (etag && etag === object.etag)
        return { status: "not-modified" as const, etag: object.etag };
      return { status: "modified" as const, etag: object.etag, body: object.body };
    }),
    head: vi.fn(async (orgId: string, etag: string | null) => {
      const object = objects.get(orgId);
      if (!object) return { status: "absent" as const };
      if (etag && etag === object.etag)
        return { status: "not-modified" as const, etag: object.etag };
      return { status: "modified" as const, etag: object.etag };
    }),
    write: vi.fn(async (orgId: string, body: string) => {
      const etag = `etag-${++counter}`;
      objects.set(orgId, { body, etag });
      return etag;
    }),
  };
  return {
    store,
    objects,
    put(orgId: string, body: string) {
      objects.set(orgId, { body, etag: `ext-${++counter}` });
    },
  };
}

function harness(
  overrides: Partial<{
    fetchFromDb: (orgId: string) => Promise<FlagConfig>;
    store: ConfigStore | null;
    writeAttempts: number;
  }> = {},
) {
  const fetchFromDb = vi.fn(
    overrides.fetchFromDb ??
      ((orgId: string) => Promise.resolve(config([orgId]))),
  );
  const store = "store" in overrides ? overrides.store! : fakeStore().store;
  const cache = createFlagConfigCache({
    fetchFromDb,
    store,
    writeAttempts: overrides.writeAttempts,
  });
  return { cache, fetchFromDb, store };
}

describe("flag config cache (store-first)", () => {
  it("reads the database and repairs the store when it is empty", async () => {
    const { store, objects } = fakeStore();
    const fetchFromDb = vi.fn((orgId: string) =>
      Promise.resolve(config([orgId])),
    );
    const cache = createFlagConfigCache({ fetchFromDb, store });

    const result = await cache.load("org");
    await flush(); // let the background repair land

    expect(result.flags[0].key).toBe("org");
    expect(fetchFromDb).toHaveBeenCalled();
    expect(store.write).toHaveBeenCalled();
    expect(objects.has("org")).toBe(true);
  });

  it("serves subsequent reads from the store, not the database", async () => {
    const fake = fakeStore();
    fake.put("org", artifactBody("org", config(["org"])));
    const fetchFromDb = vi.fn(() => Promise.resolve(config(["db"])));
    const cache = createFlagConfigCache({ fetchFromDb, store: fake.store });

    const first = await cache.load("org");
    const second = await cache.load("org");

    expect(first.flags[0].key).toBe("org");
    expect(second).toBe(first);
    expect(fetchFromDb).not.toHaveBeenCalled(); // wholly from the store
  });

  it("picks up an external change and re-verifies from the store", async () => {
    const fake = fakeStore();
    fake.put("org", artifactBody("org", config(["v1"])));
    const cache = createFlagConfigCache({
      fetchFromDb: () => Promise.resolve(config(["db"])),
      store: fake.store,
    });

    expect((await cache.load("org")).flags[0].key).toBe("v1");
    fake.put("org", artifactBody("org", config(["v2"])));
    expect((await cache.load("org")).flags[0].key).toBe("v2");
  });

  it("falls back to the database and repairs a corrupt artifact", async () => {
    const fake = fakeStore();
    fake.put("org", "not-a-valid-envelope");
    const fetchFromDb = vi.fn(() => Promise.resolve(config(["org"])));
    const cache = createFlagConfigCache({ fetchFromDb, store: fake.store });

    const result = await cache.load("org");
    await flush();

    expect(result.flags[0].key).toBe("org"); // served from the database
    // The corrupt object was rewritten with a valid, re-readable artifact.
    const repaired = fake.objects.get("org")!.body;
    expect(repaired).not.toBe("not-a-valid-envelope");
    expect(JSON.parse(repaired).schema).toBe(1);
  });

  it("falls back to the database when the store read throws", async () => {
    const store = fakeStore().store;
    (store.read as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("store down"),
    );
    const h = harness({ store });
    const result = await h.cache.load("org");
    expect(result.flags[0].key).toBe("org");
    expect(h.fetchFromDb).toHaveBeenCalled();
  });

  it("writeArtifact publishes and returns the version and checksum", async () => {
    const fake = fakeStore();
    const c = config(["published"]);
    const cache = createFlagConfigCache({
      fetchFromDb: () => Promise.resolve(c),
      store: fake.store,
    });

    const result = await cache.writeArtifact("org");
    expect(result).toMatchObject({
      version: buildArtifact("org", c).version,
      checksum: buildArtifact("org", c).checksum,
    });
    expect(fake.objects.has("org")).toBe(true);
    // Primed: a following load is served from cache with no store re-read miss.
    expect((await cache.load("org")).flags[0].key).toBe("published");
  });

  it("retries a failing store write within its budget", async () => {
    const fake = fakeStore();
    let calls = 0;
    (fake.store.write as ReturnType<typeof vi.fn>).mockImplementation(
      async (orgId: string, body: string) => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        const etag = `etag-retry-${calls}`;
        fake.objects.set(orgId, { body, etag });
        return etag;
      },
    );
    const cache = createFlagConfigCache({
      fetchFromDb: () => Promise.resolve(config(["org"])),
      store: fake.store,
      writeAttempts: 3,
    });

    const result = await cache.writeArtifact("org");
    expect(result).not.toBeNull();
    expect(calls).toBe(3);
  });

  it("throws once the write retry budget is exhausted", async () => {
    const store = fakeStore().store;
    (store.write as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("store down"),
    );
    const cache = createFlagConfigCache({
      fetchFromDb: () => Promise.resolve(config(["org"])),
      store,
      writeAttempts: 2,
    });
    await expect(cache.writeArtifact("org")).rejects.toThrow("store down");
  });

  it("coalesces a stampede of concurrent misses into one read", async () => {
    const fake = fakeStore();
    fake.put("org", artifactBody("org", config(["org"])));
    const fetchFromDb = vi.fn(() => Promise.resolve(config(["db"])));
    const cache = createFlagConfigCache({ fetchFromDb, store: fake.store });
    const results = await Promise.all([
      cache.load("org"),
      cache.load("org"),
      cache.load("org"),
    ]);
    expect(fake.store.read).toHaveBeenCalledTimes(1);
    expect(results[0]).toBe(results[2]);
  });

  it("serves from the database (briefly cached) when no store is configured", async () => {
    let clock = 1000;
    const fetchFromDb = vi.fn((orgId: string) =>
      Promise.resolve(config([orgId])),
    );
    const cache = createFlagConfigCache({
      fetchFromDb,
      store: null,
      fallbackTtlMs: 10_000,
      now: () => clock,
    });
    await cache.load("org");
    await cache.load("org");
    expect(fetchFromDb).toHaveBeenCalledTimes(1); // second read within TTL is cached
    clock += 10_001;
    await cache.load("org");
    expect(fetchFromDb).toHaveBeenCalledTimes(2); // re-read after the TTL
    expect(await cache.writeArtifact("org")).toBeNull();
  });

  it("protects the database during a store outage (cold instance)", async () => {
    const clock = 1000;
    const store = fakeStore().store;
    (store.read as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("R2 down"),
    );
    const fetchFromDb = vi.fn(() => Promise.resolve(config(["org"])));
    const cache = createFlagConfigCache({
      fetchFromDb,
      store,
      fallbackTtlMs: 10_000,
      now: () => clock,
    });
    // Many evals during the outage collapse onto one database read per TTL,
    // not one per evaluation.
    await Promise.all([
      cache.load("org"),
      cache.load("org"),
      cache.load("org"),
    ]);
    await cache.load("org");
    expect(fetchFromDb).toHaveBeenCalledTimes(1);
  });
});
