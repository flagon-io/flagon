import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Warn-first threshold notifications: prove the exactly-once claim on the counter's
 * notified_*_at stamps. We assert the STAMP transitions (the dedup guarantee), which
 * happen before recipients are resolved, so no org/member fixtures are needed — a
 * bare org id with a hobby default plan (2M cap) is enough. The email send itself is
 * the console adapter in tests (no RESEND key), so it just logs.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;
const HOBBY_INCLUDED = 500_000;

describe.skipIf(!DATABASE_URL)("usage threshold notifications (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let notifyUsageThresholds: typeof import("./notify.js")["notifyUsageThresholds"];
  let currentBillingPeriod: typeof import("./allowance.js")["currentBillingPeriod"];

  const orgId = randomUUID();

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ notifyUsageThresholds } = await import("./notify.js"));
    ({ currentBillingPeriod } = await import("./allowance.js"));
  });

  afterEach(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(t.usageCounters).where(eq(t.usageCounters.organizationId, orgId)),
    );
  });

  const seed = (count: number) =>
    withOrg(orgId, (tx) =>
      tx.insert(t.usageCounters).values({
        organizationId: orgId,
        period: currentBillingPeriod().from.slice(0, 7),
        count,
      }),
    );

  const stamps = async () => {
    const [row] = await withOrg(orgId, (tx) =>
      tx
        .select({
          notified80At: t.usageCounters.notified80At,
          notified100At: t.usageCounters.notified100At,
        })
        .from(t.usageCounters)
        .where(eq(t.usageCounters.organizationId, orgId)),
    );
    return row!;
  };

  it("stamps 100% once and never falls back to an 80% email", async () => {
    await seed(HOBBY_INCLUDED); // exactly at the cap
    await notifyUsageThresholds(orgId);
    const first = await stamps();
    expect(first.notified100At).not.toBeNull();
    expect(first.notified80At).toBeNull(); // jumped past 80, so 80 is never sent

    // A second ingest must not re-send, and must NOT now claim the 80% email.
    await notifyUsageThresholds(orgId);
    const second = await stamps();
    expect(second.notified100At).toEqual(first.notified100At); // unchanged: claimed once
    expect(second.notified80At).toBeNull();
  });

  it("stamps 80% on the gradual path, then 100% when the cap is reached", async () => {
    await seed(Math.floor(HOBBY_INCLUDED * 0.8)); // exactly 80%
    await notifyUsageThresholds(orgId);
    const at80 = await stamps();
    expect(at80.notified80At).not.toBeNull();
    expect(at80.notified100At).toBeNull();

    // Usage climbs to the cap; the next notify sends the 100% email too.
    await withOrg(orgId, (tx) =>
      tx
        .update(t.usageCounters)
        .set({ count: HOBBY_INCLUDED })
        .where(
          and(
            eq(t.usageCounters.organizationId, orgId),
            eq(t.usageCounters.period, currentBillingPeriod().from.slice(0, 7)),
          ),
        ),
    );
    await notifyUsageThresholds(orgId);
    const at100 = await stamps();
    expect(at100.notified80At).toEqual(at80.notified80At); // 80 unchanged
    expect(at100.notified100At).not.toBeNull(); // 100 now claimed
  });

  it("does not notify below 80%", async () => {
    await seed(Math.floor(HOBBY_INCLUDED * 0.5));
    await notifyUsageThresholds(orgId);
    const s = await stamps();
    expect(s.notified80At).toBeNull();
    expect(s.notified100At).toBeNull();
  });
});
