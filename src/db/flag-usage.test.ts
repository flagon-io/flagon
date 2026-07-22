import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * The exposure pipeline, end to end against a real database.
 *
 * These are the properties that make per-flag analytics trustworthy: a batch
 * receipt that does not dedupe would let a retried delivery double a flag's
 * checks; an upsert that does not sum would lose them; and an exposure that
 * stored a targeting identity would be a privacy breach. Each is checked
 * against Postgres, not a mock.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
  process.env.DATABASE_URL_OWNER &&
  process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("flag usage exposure pipeline", () => {
  const stamp = Date.now();
  const slug = `flag-usage-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let orgId = "";

  let mod: typeof import("@/lib/flag-usage.server");

  const hour = (iso: string) => new Date(iso);

  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 5 });
    ({ closePool } = await import("@/db/client"));
    mod = await import("@/lib/flag-usage.server");
    const [org] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${slug}, 'Flag Usage Org', 'pro') RETURNING id
    `;
    orgId = org.id as string;
  });

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug = ${slug}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("folds a pre-aggregated batch into the hourly rollups", async () => {
    const outcome = await mod.recordExposureBatch({
      orgId,
      batchId: "batch-1",
      entries: [
        {
          flagKey: "checkout",
          variantKey: "on",
          reason: "TARGETING_MATCH",
          hour: hour("2026-07-20T10:00:00Z"),
          count: 40,
        },
        {
          flagKey: "checkout",
          variantKey: "off",
          reason: "STATIC",
          hour: hour("2026-07-20T10:00:00Z"),
          count: 10,
        },
      ],
    });
    expect(outcome).toEqual({ status: "recorded", entries: 2 });

    const usage = await mod.flagUsageDetail(orgId, "checkout", 3650);
    expect(usage.totalChecks).toBe(50);
    const on = usage.byVariant.find((v) => v.variantKey === "on");
    expect(on?.count).toBe(40);
    expect(usage.byReason.TARGETING_MATCH).toBe(40);
    expect(usage.byReason.STATIC).toBe(10);
  });

  it("sums a second distinct batch onto the same grain", async () => {
    await mod.recordExposureBatch({
      orgId,
      batchId: "batch-2",
      entries: [
        {
          flagKey: "checkout",
          variantKey: "on",
          reason: "TARGETING_MATCH",
          hour: hour("2026-07-20T10:00:00Z"),
          count: 5,
        },
      ],
    });
    const usage = await mod.flagUsageDetail(orgId, "checkout", 3650);
    const on = usage.byVariant.find((v) => v.variantKey === "on");
    expect(on?.count).toBe(45); // 40 + 5
    expect(usage.totalChecks).toBe(55);
  });

  it("drops a replayed batch whole, without adding a single check", async () => {
    const replay = await mod.recordExposureBatch({
      orgId,
      batchId: "batch-1", // already applied
      entries: [
        {
          flagKey: "checkout",
          variantKey: "on",
          reason: "TARGETING_MATCH",
          hour: hour("2026-07-20T10:00:00Z"),
          count: 40,
        },
      ],
    });
    expect(replay).toEqual({ status: "duplicate" });

    const usage = await mod.flagUsageDetail(orgId, "checkout", 3650);
    expect(usage.totalChecks).toBe(55); // unchanged
  });

  it("records a server-side exposure and surfaces it in the summary", async () => {
    await mod.recordServerExposure({
      orgId,
      flagKey: "settings-page",
      variantKey: "on",
      reason: "STATIC",
      at: new Date(),
    });
    const summary = await mod.flagUsageSummary(orgId);
    expect(summary.get("settings-page")?.totalChecks).toBe(1);
    // orgEmitsExposures becomes true once there is any exposure in the window.
    expect(await mod.orgEmitsExposures(orgId)).toBe(true);
  });

  it("stores no raw targeting identity in a sample, only a hash", async () => {
    await mod.recordExposureSample({
      orgId,
      flagKey: "settings-page",
      variantKey: "on",
      reason: "STATIC",
      // A value that would be unmistakable if it were stored raw.
      targetingKey: "user-PLAINTEXT-secret-42",
      at: new Date(),
    });

    // Scan the whole table with the OWNER (bypassing RLS) - the raw value must
    // appear nowhere, hashed or absent only.
    const rows = await owner`
      SELECT targeting_key_hash FROM flag_exposure_samples
      WHERE organization_id = ${orgId}::uuid
    `;
    for (const row of rows) {
      expect(row.targeting_key_hash).not.toContain("PLAINTEXT");
    }
    const raw = await owner`
      SELECT count(*)::int AS n FROM flag_exposure_samples
      WHERE organization_id = ${orgId}::uuid
        AND targeting_key_hash LIKE '%PLAINTEXT%'
    `;
    expect(raw[0].n).toBe(0);
  });

  it("folds hourly rollups into the daily table", async () => {
    // A recent hour so the bounded fold lookback includes it.
    const recentHour = new Date();
    recentHour.setUTCMinutes(0, 0, 0);
    await mod.recordExposureBatch({
      orgId,
      batchId: "batch-fold",
      entries: [
        {
          flagKey: "fold-me",
          variantKey: "on",
          reason: "STATIC",
          hour: recentHour,
          count: 7,
        },
      ],
    });
    const folded = await mod.foldFlagUsageDaily(orgId);
    expect(folded).toBeGreaterThan(0);

    const daily = await owner`
      SELECT count FROM flag_usage_daily
      WHERE organization_id = ${orgId}::uuid AND flag_key = 'fold-me'
    `;
    expect(Number(daily[0].count)).toBe(7);
  });

  describe("entry validation (client-controlled body is bounded)", () => {
    const NOW = new Date("2026-07-21T12:00:00Z");
    const good = {
      flag_key: "new-checkout",
      variant: "on",
      reason: "STATIC",
      hour: "2026-07-21T11:00:00Z",
      count: 5,
    };

    it("accepts a well-formed entry", () => {
      const entry = mod.normalizeEntry(good, NOW);
      expect(entry?.flagKey).toBe("new-checkout");
      expect(entry?.count).toBe(5);
    });

    it("rejects a garbage or oversized flag key", () => {
      expect(
        mod.normalizeEntry({ ...good, flag_key: "Bad Key!" }, NOW),
      ).toBeNull();
      expect(mod.normalizeEntry({ ...good, flag_key: "" }, NOW)).toBeNull();
      expect(
        mod.normalizeEntry({ ...good, flag_key: "a".repeat(200) }, NOW),
      ).toBeNull();
    });

    it("rejects an unknown reason", () => {
      expect(
        mod.normalizeEntry({ ...good, reason: "MADE_UP" }, NOW),
      ).toBeNull();
    });

    it("caps an implausible count instead of trusting it", () => {
      const entry = mod.normalizeEntry({ ...good, count: 5e12 }, NOW);
      expect(entry?.count).toBe(mod.MAX_ENTRY_COUNT);
    });

    it("drops an hour outside the sane window", () => {
      // Far future (beyond clock skew) and ancient (beyond retention).
      expect(
        mod.normalizeEntry({ ...good, hour: "2027-01-01T00:00:00Z" }, NOW),
      ).toBeNull();
      expect(
        mod.normalizeEntry({ ...good, hour: "2020-01-01T00:00:00Z" }, NOW),
      ).toBeNull();
    });

    it("drops a non-positive count", () => {
      expect(mod.normalizeEntry({ ...good, count: 0 }, NOW)).toBeNull();
      expect(mod.normalizeEntry({ ...good, count: -3 }, NOW)).toBeNull();
    });
  });
});
