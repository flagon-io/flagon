import { describe, expect, it } from "vitest";
import { bucket, rolloutSeed } from "./bucket.js";

describe("bucket", () => {
  it("is in [0, 1)", () => {
    for (let i = 0; i < 1000; i++) {
      const b = bucket(`seed-${i}`);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    expect(bucket("user-42")).toBe(bucket("user-42"));
  });

  it("differs across seeds", () => {
    expect(bucket("user-1")).not.toBe(bucket("user-2"));
  });

  it("spreads roughly uniformly", () => {
    const buckets = new Array(10).fill(0);
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      buckets[Math.floor(bucket(`k-${i}`) * 10)]++;
    }
    // Each decile should hold ~10% (1000). Allow a generous ±35% band so the
    // test is about "not lumpy", not a statistics exam.
    for (const count of buckets) {
      expect(count).toBeGreaterThan(650);
      expect(count).toBeLessThan(1350);
    }
  });

  it("seeds by flag + identity, namespaced", () => {
    expect(rolloutSeed("my-flag", "user-1")).toBe("my-flag:user-1");
    expect(rolloutSeed("my-flag", null)).toBe("my-flag:");
    expect(rolloutSeed("my-flag", 42)).toBe("my-flag:42");
  });
});
