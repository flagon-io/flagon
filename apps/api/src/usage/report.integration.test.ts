import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { isMeteredReportable } from "../lib/entitlement.js";

/**
 * The metered-reporting CLAIM — the exactly-once core (the Stripe send + invoice math
 * is proven separately by scripts/validate-metered.ts against test-mode Stripe). Proves
 * a receipt is claimed at most once, only compacted receipts are reported, and the
 * per-period credit ledger is idempotent. DB-gated; skipped without a database.
 */

// --- Pure: the reporting gate (invariant #2). ----------------------------------
describe("isMeteredReportable", () => {
  const base = { plan: "pro", subscriptionStatus: "active", stripeCustomerId: "cus_1" };
  it("reports an active, customer-linked Pro org", () => {
    expect(isMeteredReportable(base)).toBe(true);
  });
  it("never reports a canceled/locked Pro org", () => {
    expect(isMeteredReportable({ ...base, subscriptionStatus: "canceled" })).toBe(false);
  });
  it("never reports a null-status (manual comp) org", () => {
    expect(isMeteredReportable({ ...base, subscriptionStatus: null })).toBe(false);
  });
  it("never reports without a Stripe customer", () => {
    expect(isMeteredReportable({ ...base, stripeCustomerId: null })).toBe(false);
  });
  it("never reports Hobby / Enterprise", () => {
    expect(isMeteredReportable({ ...base, plan: "hobby" })).toBe(false);
    expect(isMeteredReportable({ ...base, plan: "enterprise" })).toBe(false);
  });
});

// --- Integration: the claim against the real tables. ---------------------------
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("metered reporting claim (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let claimAndStage: typeof import("./report.js")["claimAndStage"];

  const orgId = randomUUID();
  const org = {
    id: orgId,
    name: "Report Test",
    slug: "report-test",
    plan: "pro",
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    subscriptionStatus: "active",
  };

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ claimAndStage } = await import("./report.js"));
  });

  afterEach(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.usageEvents).where(eq(t.usageEvents.organizationId, orgId));
      await tx.delete(t.usageMeterReports).where(eq(t.usageMeterReports.organizationId, orgId));
    });
  });

  const seed = (quantity: number, opts: { compacted?: boolean; source?: string } = {}) =>
    withOrg(orgId, (tx) =>
      tx.insert(t.usageEvents).values({
        organizationId: orgId,
        source: opts.source ?? "flags.exposure",
        idempotencyKey: randomUUID(),
        quantity,
        occurredAt: new Date(),
        day: "2026-08-01",
        compactedAt: opts.compacted === false ? null : new Date(),
      }),
    );

  const reportRows = () =>
    withOrg(orgId, (tx) =>
      tx.select().from(t.usageMeterReports).where(eq(t.usageMeterReports.organizationId, orgId)),
    );
  const unreportedCount = () =>
    withOrg(orgId, (tx) =>
      tx
        .select()
        .from(t.usageEvents)
        .where(and(eq(t.usageEvents.organizationId, orgId), isNull(t.usageEvents.reportedAt))),
    ).then((r) => r.length);

  it("claims compacted receipts exactly once, summed per source", async () => {
    await seed(1000);
    await seed(500);
    await claimAndStage(org, "2026-08");

    expect(await unreportedCount()).toBe(0);
    const rows = await reportRows();
    expect(rows.length).toBe(1);
    expect(rows[0]!.quantity).toBe(1500);
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.eventName).toBe("flagon_events");

    // A second claim finds nothing new — no duplicate report row, no re-report.
    await claimAndStage(org, "2026-08");
    expect((await reportRows()).length).toBe(1);
  });

  it("never claims an uncompacted receipt (stays unreported)", async () => {
    await seed(999, { compacted: false });
    await claimAndStage(org, "2026-08");
    expect((await reportRows()).length).toBe(0);
    expect(await unreportedCount()).toBe(1);
  });
});

// --- Integration: the credit ledger is idempotent per (org, period). -----------
describe.skipIf(!DATABASE_URL)("credit grant ledger (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  const orgId = randomUUID();

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
  });
  afterEach(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(t.billingCreditGrants).where(eq(t.billingCreditGrants.organizationId, orgId)),
    );
  });

  it("a second grant for the same period is a no-op (UNIQUE org+period)", async () => {
    const insertGrant = () =>
      withOrg(orgId, (tx) =>
        tx
          .insert(t.billingCreditGrants)
          .values({ organizationId: orgId, periodKey: "2026-08-01", amountCents: 2000 })
          .onConflictDoNothing({
            target: [t.billingCreditGrants.organizationId, t.billingCreditGrants.periodKey],
          })
          .returning({ id: t.billingCreditGrants.id }),
      );
    expect((await insertGrant()).length).toBe(1); // first wins
    expect((await insertGrant()).length).toBe(0); // second: no row => never double-grants
  });
});
