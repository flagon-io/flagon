import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { isIngestCapped, type AllowanceStatus } from "./allowance.js";

/**
 * The events-allowance status: proves we correctly SEE when an org is over its
 * plan's included events, and that the enforcement predicate only blocks under the
 * exact conditions we intend. The status math runs against the real rollups
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
    enforcement: "enforce",
  };

  it("blocks only an enforced, over, hard-cap plan", () => {
    expect(isIngestCapped(base)).toBe(true);
  });
  it("never blocks while enforcement is off (the default)", () => {
    expect(isIngestCapped({ ...base, enforcement: "off" })).toBe(false);
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
      tx.delete(t.usageEventRollups).where(eq(t.usageEventRollups.organizationId, orgId)),
    );
  });

  // Seed events dated within the current period, so the period sum picks them up.
  const seed = (count: number) =>
    withOrg(orgId, (tx) =>
      tx.insert(t.usageEventRollups).values({
        organizationId: orgId,
        day: currentBillingPeriod().to,
        source: "flags.exposure",
        count,
      }),
    );
  const statusFor = (plan: string) =>
    withOrg(orgId, (tx) => eventsAllowanceStatus(tx, plan));

  it("hobby under the 2M cap is not over", async () => {
    await seed(1_000_000);
    const s = await statusFor("hobby");
    expect(s).toMatchObject({
      includedEvents: 2_000_000,
      usedEvents: 1_000_000,
      remainingEvents: 1_000_000,
      overageEvents: 0,
      isOver: false,
      overageCents: 0,
      overageMode: "cap",
      enforcement: "off",
    });
  });

  it("hobby over the cap is over, but never charged (cap)", async () => {
    await seed(3_000_000);
    const s = await statusFor("hobby");
    expect(s).toMatchObject({
      usedEvents: 3_000_000,
      remainingEvents: 0,
      overageEvents: 1_000_000,
      isOver: true,
      overageCents: 0,
    });
  });

  it("pro over 5M projects an overage charge at the events rate", async () => {
    await seed(6_000_000);
    const s = await statusFor("pro");
    // 1M over * $0.05/1K = $50.00 = 5000 cents.
    expect(s).toMatchObject({
      includedEvents: 5_000_000,
      overageEvents: 1_000_000,
      isOver: true,
      overageMode: "bill",
      overageCents: 5000,
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
