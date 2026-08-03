import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { isIngestCapped, type AllowanceStatus } from "./allowance.js";

/**
 * The events-allowance status: proves we correctly SEE when an org is over its
 * plan's included events, and that the refuse predicate only blocks under the
 * exact conditions we intend. The status math runs against the real atomic counter
 * (DB-gated); the block predicate is pure and always runs.
 */

// --- Pure: the one predicate the exposures route consults to refuse ingest. ----
describe("isIngestCapped", () => {
  const base: AllowanceStatus = {
    plan: "hobby",
    overageMode: "cap",
    period: { from: "2026-07-01", to: "2026-07-31" },
    includedEvents: 2_000_000,
    usedEvents: 3_000_000,
    remainingEvents: 0,
    overageEvents: 1_000_000,
    isOver: true,
    overageCents: 0,
    hardCap: true,
  };

  it("blocks only a hard-cap 'cap' plan that is over", () => {
    expect(isIngestCapped(base)).toBe(true);
  });
  it("never blocks a warn-first plan (hardCap off — every plan today)", () => {
    expect(isIngestCapped({ ...base, hardCap: false })).toBe(false);
  });
  it("never blocks a billing plan (it meters overage instead)", () => {
    expect(isIngestCapped({ ...base, overageMode: "bill" })).toBe(false);
  });
  it("never blocks a plan that is under its allowance", () => {
    expect(isIngestCapped({ ...base, isOver: false })).toBe(false);
  });
});

// --- Integration: the status math against the real rollups. --------------------
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("eventsAllowanceStatus (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let eventsAllowanceStatus: typeof import("./allowance.js")["eventsAllowanceStatus"];
  let currentBillingPeriod: typeof import("./allowance.js")["currentBillingPeriod"];

  const orgId = randomUUID();

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ eventsAllowanceStatus, currentBillingPeriod } = await import("./allowance.js"));
  });

  afterEach(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(t.usageCounters).where(eq(t.usageCounters.organizationId, orgId)),
    );
  });

  // Seed the atomic counter for the current period — the source eventsUsedInPeriod
  // now reads (usageEventRollups is only the per-day picture).
  const seed = (count: number) =>
    withOrg(orgId, (tx) =>
      tx.insert(t.usageCounters).values({
        organizationId: orgId,
        period: currentBillingPeriod().from.slice(0, 7),
        count,
      }),
    );
  const statusFor = (plan: string) =>
    withOrg(orgId, (tx) => eventsAllowanceStatus(tx, plan));

  it("hobby under the 1M cap is not over", async () => {
    await seed(500_000);
    const s = await statusFor("hobby");
    expect(s).toMatchObject({
      includedEvents: 1_000_000,
      usedEvents: 500_000,
      remainingEvents: 500_000,
      overageEvents: 0,
      isOver: false,
      overageCents: 0,
      overageMode: "cap",
      hardCap: true,
    });
    // Under the cap: not over, so ingest is not refused even though Hobby hard-caps.
    expect(isIngestCapped(s)).toBe(false);
  });

  it("hobby over the cap is over, never charged, and refuses ingest (hard cap)", async () => {
    await seed(1_500_000);
    const s = await statusFor("hobby");
    expect(s).toMatchObject({
      usedEvents: 1_500_000,
      remainingEvents: 0,
      overageEvents: 500_000,
      isOver: true,
      overageCents: 0,
      hardCap: true,
    });
    // Hobby hard-caps: over the allowance, event ingest is refused (a 403 on the
    // exposures route). Flag evaluation is unaffected — only metering stops.
    expect(isIngestCapped(s)).toBe(true);
  });

  it("pro over its $150 credit (3M) projects an overage charge at the events rate", async () => {
    await seed(5_000_000);
    const s = await statusFor("pro");
    // 5M used, 3M included → 2M over * $0.05/1K = $100 = 10000 cents. The $150 credit shows fully used.
    expect(s).toMatchObject({
      includedEvents: 3_000_000,
      overageEvents: 2_000_000,
      isOver: true,
      overageMode: "bill",
      overageCents: 10000,
      creditCents: 15000,
      creditUsedCents: 15000,
    });
  });

  it("enterprise is contracted: no allowance, never flagged over", async () => {
    await seed(9_000_000);
    const s = await statusFor("enterprise");
    expect(s).toMatchObject({
      overageMode: "contract",
      remainingEvents: null,
      overageEvents: 0,
      isOver: false,
    });
  });
});
