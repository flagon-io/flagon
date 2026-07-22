import { describe, it, expect } from "vitest";
import {
  assessFlag,
  checksPerHour,
  dailyBuckets,
  passRate,
  recentBuckets,
  variantDistribution,
  STALE_AFTER_DAYS,
  type UsagePoint,
  type VariantCount,
} from "./flag-metrics";

const NOW = new Date("2026-07-21T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const hoursAgo = (n: number) =>
  new Date(NOW.getTime() - n * 3_600_000).toISOString().slice(0, 13) +
  ":00:00Z";

describe("pass rate", () => {
  const boolean: VariantCount[] = [
    { variantKey: "on", count: 42 },
    { variantKey: "off", count: 8 },
  ];

  it("is the share of `on` for a boolean flag", () => {
    expect(passRate(boolean, "boolean")).toBeCloseTo(0.84, 5);
  });

  it("is null for a non-boolean flag, where a single number is meaningless", () => {
    expect(passRate(boolean, "string")).toBeNull();
    expect(passRate(boolean, "object")).toBeNull();
  });

  it("is null when there is nothing to divide", () => {
    expect(passRate([], "boolean")).toBeNull();
  });
});

describe("variant distribution", () => {
  it("returns shares, largest first", () => {
    const dist = variantDistribution([
      { variantKey: "off", count: 10 },
      { variantKey: "on", count: 30 },
    ]);
    expect(dist[0]).toEqual({ variantKey: "on", count: 30, share: 0.75 });
    expect(dist[1]).toEqual({ variantKey: "off", count: 10, share: 0.25 });
  });
});

describe("checks per hour", () => {
  it("averages the last 24h over the whole window, not just active hours", () => {
    // 240 checks in one recent hour -> 10/hr sustained, not 240.
    const series: UsagePoint[] = [{ at: hoursAgo(1), count: 240 }];
    expect(checksPerHour(series, NOW)).toBeCloseTo(10, 5);
  });

  it("ignores buckets older than the window", () => {
    const series: UsagePoint[] = [{ at: hoursAgo(48), count: 1000 }];
    expect(checksPerHour(series, NOW)).toBe(0);
  });
});

describe("bucketing", () => {
  it("places recent hours by age, index 0 oldest", () => {
    const series: UsagePoint[] = [
      { at: hoursAgo(0), count: 5 },
      { at: hoursAgo(2), count: 3 },
    ];
    const buckets = recentBuckets(series, NOW, 4);
    expect(buckets).toEqual([0, 3, 0, 5]);
  });

  it("sums hourly points into their day for the daily view", () => {
    const series: UsagePoint[] = [
      { at: hoursAgo(1), count: 5 },
      { at: hoursAgo(3), count: 7 },
      { at: hoursAgo(26), count: 4 },
    ];
    const days = dailyBuckets(series, NOW, 3);
    // Today = 12, yesterday = 4, the day before = 0.
    expect(days).toEqual([0, 4, 12]);
  });
});

describe("staleness", () => {
  const oldInert = {
    createdAt: daysAgo(120),
    updatedAt: daysAgo(95),
    rules: [] as unknown[],
  };

  it("never flags a brand-new flag, whatever its traffic", () => {
    const result = assessFlag(
      { createdAt: daysAgo(5), updatedAt: daysAgo(5), rules: [] },
      { now: NOW, lastCheckedAt: null, orgEmitsExposures: true },
    );
    expect(result.stale).toBe(false);
  });

  it("flags an old, untouched, rule-less flag with no traffic", () => {
    const result = assessFlag(oldInert, {
      now: NOW,
      lastCheckedAt: null,
      orgEmitsExposures: false,
    });
    expect(result.stale).toBe(true);
    expect(result.reasons).toContain("No recorded checks");
    expect(result.reasons).toContain("No targeting rules");
    expect(result.reasons.some((r) => r.startsWith("Unchanged"))).toBe(true);
  });

  it("keeps an old flag active when it is still being checked", () => {
    const result = assessFlag(oldInert, {
      now: NOW,
      lastCheckedAt: daysAgo(1),
      orgEmitsExposures: true,
    });
    expect(result.stale).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("trusts traffic once the org emits exposures: a rule-heavy but unused flag is stale", () => {
    // Has rules (not inert), but the org emits exposures and this flag has had
    // none in the window: nobody checks it. Stale, without the noRules crutch.
    const result = assessFlag(
      { createdAt: daysAgo(200), updatedAt: daysAgo(60), rules: [{}, {}] },
      {
        now: NOW,
        lastCheckedAt: daysAgo(STALE_AFTER_DAYS + 5),
        orgEmitsExposures: true,
      },
    );
    expect(result.stale).toBe(true);
  });

  it("does NOT call a rule-heavy flag stale when the org emits no exposures", () => {
    // No exposure integration means no traffic for ANY flag; without the
    // config corroboration (it has rules), this must not be called stale.
    const result = assessFlag(
      { createdAt: daysAgo(200), updatedAt: daysAgo(60), rules: [{}, {}] },
      { now: NOW, lastCheckedAt: null, orgEmitsExposures: false },
    );
    expect(result.stale).toBe(false);
  });

  it("keeps a recently edited flag active even if unused", () => {
    const result = assessFlag(
      { createdAt: daysAgo(200), updatedAt: daysAgo(3), rules: [] },
      { now: NOW, lastCheckedAt: null, orgEmitsExposures: true },
    );
    expect(result.stale).toBe(false);
  });
});
