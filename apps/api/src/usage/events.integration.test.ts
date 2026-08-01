import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The durable, billing-grade events meter against the REAL tables: prove the
 * three properties invoicing depends on — idempotent ingest (a retry never
 * double-counts), exactly-once compaction (folding into the rollups twice is a
 * no-op), and reconciliation (the rollups equal the receipts behind them).
 *
 * Runs only where a migrated database is reachable (CI; or locally with
 * DATABASE_URL/APP_DATABASE_URL on a migrated DB); skipped otherwise. All writes
 * go through withOrg(), so it passes whether the connection enforces RLS (the
 * restricted role, as in CI) or bypasses it (a superuser). A fresh random org
 * isolates the reconciliation, which compares every rollup for the org.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("durable usage meter (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let ingestEvents: typeof import("./events.js")["ingestEvents"];
  let compactUsageEvents: typeof import("./events.js")["compactUsageEvents"];
  let reconcileUsage: typeof import("./events.js")["reconcileUsage"];

  const orgId = randomUUID();

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ ingestEvents, compactUsageEvents, reconcileUsage } = await import("./events.js"));
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.usageEvents).where(eq(t.usageEvents.organizationId, orgId));
      await tx.delete(t.usageEventRollups).where(eq(t.usageEventRollups.organizationId, orgId));
    });
  });

  const receiptCount = () =>
    withOrg(orgId, (tx) =>
      tx.select().from(t.usageEvents).where(eq(t.usageEvents.organizationId, orgId)),
    ).then((rows) => rows.length);

  it("records a batch as one durable receipt", async () => {
    expect(await ingestEvents(orgId, 5, { idempotencyKey: "batch-1" })).toEqual({
      recorded: 5,
      duplicate: false,
    });
    expect(await receiptCount()).toBe(1);
  });

  it("is idempotent: a retry with the same key counts once", async () => {
    expect(await ingestEvents(orgId, 5, { idempotencyKey: "batch-1" })).toEqual({
      recorded: 0,
      duplicate: true,
    });
    // A repeat mismatched count still wins-first: the original receipt is untouched.
    expect(await ingestEvents(orgId, 999, { idempotencyKey: "batch-1" })).toEqual({
      recorded: 0,
      duplicate: true,
    });
    expect(await receiptCount()).toBe(1);
  });

  it("counts distinct idempotency keys separately", async () => {
    expect(await ingestEvents(orgId, 3, { idempotencyKey: "batch-2" })).toEqual({
      recorded: 3,
      duplicate: false,
    });
    expect(await receiptCount()).toBe(2);
  });

  it("mints a key when none is given (durable, not deduplicated)", async () => {
    expect((await ingestEvents(orgId, 1)).duplicate).toBe(false);
    expect((await ingestEvents(orgId, 1)).duplicate).toBe(false);
    expect(await receiptCount()).toBe(4);
  });

  it("compacts every receipt into the rollups exactly once", async () => {
    // 5 (batch-1) + 3 (batch-2) + 1 + 1 across 4 receipts.
    expect(await compactUsageEvents(orgId)).toEqual({ compacted: 4, quantity: 10 });
    // A second run folds nothing — the claimed receipts are already stamped.
    expect(await compactUsageEvents(orgId)).toEqual({ compacted: 0, quantity: 0 });
  });

  it("reconciles: the rollups equal the compacted receipts", async () => {
    expect(await reconcileUsage(orgId)).toEqual({ ok: true, discrepancies: [] });
  });

  it("a late receipt compacts on the next run and still reconciles", async () => {
    await ingestEvents(orgId, 7, { idempotencyKey: "batch-3" });
    expect(await compactUsageEvents(orgId)).toEqual({ compacted: 1, quantity: 7 });
    expect(await reconcileUsage(orgId)).toEqual({ ok: true, discrepancies: [] });
  });
});
