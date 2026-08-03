import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Proves the console usage breakdown attributes billable events to the PRODUCT
 * that produced them (via the rollup `source`), so the usage table renders
 * per-product bands rather than one lumped line. DB-gated: the read runs through
 * withOrg() so RLS scopes it exactly as the app does.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("orgUsage per-product breakdown (integration)", () => {
  let db: (typeof import("../db/client.js"))["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let orgUsage: (typeof import("./org-usage.js"))["orgUsage"];

  const orgId = randomUUID();
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ orgUsage } = await import("./org-usage.js"));
  });

  afterEach(async () => {
    if (!db) return;
    await withOrg(orgId, (tx) =>
      tx.delete(t.usageEventRollups).where(eq(t.usageEventRollups.organizationId, orgId)),
    );
  });

  it("splits billable events into one line per source, attributed to its product", async () => {
    // Two products' worth of billable events on the same day: flag exposures (a
    // registered source) and a second, not-yet-registered source.
    await withOrg(orgId, (tx) =>
      tx.insert(t.usageEventRollups).values([
        { organizationId: orgId, day: today, source: "flags.exposure", count: 5000 },
        { organizationId: orgId, day: today, source: "catalog.metric", count: 2000 },
      ]),
    );

    const usage = await withOrg(orgId, (tx) =>
      orgUsage(tx, { from: today, to: today, groupBy: "meter" }),
    );

    const billable = usage.series.filter((s) => s.billable);
    const flags = billable.find((s) => s.key === "events:flags.exposure");
    const catalog = billable.find((s) => s.key === "events:catalog.metric");

    // A registered source is attributed to its product and reads under that band.
    expect(flags).toMatchObject({
      product: "Feature Flags",
      label: "Flag exposures",
      usage: 5000,
    });
    // An unregistered source is still its own line; it falls back to the platform
    // label until it's added to SOURCE_METERS, at which point it gets its own band.
    expect(catalog).toMatchObject({ product: "Platform", label: "Events", usage: 2000 });

    // Distinct products among sources WITH usage => distinct bands (what the table
    // groups on). Filtered to usage > 0 so it stays robust as more billable sources
    // are registered (e.g. experiments.metric), which show a zero line until used.
    expect(
      new Set(billable.filter((s) => s.usage > 0).map((s) => s.product)).size,
    ).toBe(2);

    // The invoice/allowance total sums across every billable line, not just one.
    expect(usage.totals.billableUsage).toBe(7000);
  });
});
