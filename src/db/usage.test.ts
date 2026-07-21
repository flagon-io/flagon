import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Usage metering end to end against a real database: recording accumulates
 * per meter per day under RLS, the view slices it by product and project, the
 * summary prices it, and closing the period freezes what was billed.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
// A fixed window so the test never straddles a real month boundary.
const window = { from: day("2026-03-01"), to: day("2026-03-31") };

describe.skipIf(!canRun)("usage metering", () => {
  const stamp = Date.now();
  const slug = `usage-org-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let orgId = "";

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug = ${slug}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("accumulates, prices, and applies the included credit", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    ({ closePool } = await import("@/db/client"));
    const { recordUsage, usageSummary } = await import("@/lib/usage.server");

    // Provisioning an org is a privileged operation (see rls.test.ts).
    const [org] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${slug}, 'Usage Org', 'pro') RETURNING id
    `;
    orgId = org.id as string;

    // Two batches for the same meter and day accumulate into one row.
    await recordUsage({
      orgId,
      meter: "flags.evaluations",
      quantity: 2_000_000,
      at: day("2026-03-05"),
    });
    await recordUsage({
      orgId,
      meter: "flags.evaluations",
      quantity: 1_400_000,
      at: day("2026-03-05"),
    });

    const [row] = await owner`
      SELECT quantity::bigint AS quantity FROM usage_rollups
      WHERE organization_id = ${orgId}::uuid
    `;
    expect(Number(row.quantity)).toBe(3_400_000);

    // Unknown meters are refused: a typo can never become a silent charge.
    await expect(
      recordUsage({ orgId, meter: "nope.nothing", quantity: 5 }),
    ).rejects.toThrow(/Unknown meter/);
    // Zero or negative usage is a no-op, not a row.
    await recordUsage({ orgId, meter: "flags.evaluations", quantity: 0 });

    const summary = await usageSummary({
      orgId,
      window,
      includedCreditCents: 2000,
    });

    // 3.4M events at $1.00/1M = $3.40 - well inside Pro's $20 of
    // included usage, which is what the credit is for.
    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0].meterId).toBe("flags.evaluations");
    expect(summary.lines[0].quantity).toBe(3_400_000);
    expect(summary.usageCents).toBe(340);
    expect(summary.creditAppliedCents).toBe(340);
    expect(summary.creditRemainingCents).toBe(1660);
    expect(summary.overageCents).toBe(0);

    // Past the included credit, the excess is what gets billed.
    await recordUsage({
      orgId,
      meter: "flags.evaluations",
      quantity: 500_000_000,
      at: day("2026-03-06"),
    });
    const over = await usageSummary({
      orgId,
      window,
      includedCreditCents: 2000,
    });
    // 503.4M at $1.00/1M = $503.40; the $20 credit absorbs what it can and
    // the rest is what actually gets billed.
    expect(over.usageCents).toBe(50_340);
    expect(over.creditAppliedCents).toBe(2000);
    expect(over.overageCents).toBe(48_340);

    // Usage is tenant data: no tenant context, no rows (RLS deny-by-default).
    const { db } = await import("@/db/client");
    const { usageRollups } = await import("@/db/schema");
    expect(await db.select().from(usageRollups)).toHaveLength(0);
  });

  it("slices by project and keeps the parts summing to the whole", async () => {
    const { recordUsage, usageView, usageSummary, ORG_LEVEL } = await import(
      "@/lib/usage.server"
    );

    const [alpha] = await owner`
      INSERT INTO projects (organization_id, slug, name)
      VALUES (${orgId}, 'alpha', 'Alpha') RETURNING id
    `;
    const [beta] = await owner`
      INSERT INTO projects (organization_id, slug, name)
      VALUES (${orgId}, 'beta', 'Beta') RETURNING id
    `;

    await recordUsage({
      orgId,
      meter: "flags.evaluations",
      quantity: 300_000_000,
      projectId: alpha.id as string,
      at: day("2026-03-10"),
    });
    await recordUsage({
      orgId,
      meter: "flags.evaluations",
      quantity: 100_000_000,
      projectId: beta.id as string,
      at: day("2026-03-10"),
    });

    const summary = await usageSummary({
      orgId,
      window,
      includedCreditCents: 2000,
    });
    const byProject = await usageView({ orgId, window, groupBy: "project" });

    // The invariant that keeps a per-project view honest: however the cents
    // are allocated, the breakdown adds up to exactly what is billed.
    const allocated = byProject.rows.reduce((sum, row) => sum + row.costCents, 0);
    expect(allocated).toBe(summary.usageCents);
    expect(byProject.rows.map((row) => row.key).sort()).toEqual(
      [ORG_LEVEL, alpha.id as string, beta.id as string].sort(),
    );

    // Buckets sum to the period total too: the allowance is drawn down in
    // time order rather than re-granted per bucket.
    const charted = byProject.buckets.reduce(
      (sum, bucket) => sum + bucket.totalCents,
      0,
    );
    expect(charted).toBe(summary.usageCents);

    // Filtering to one project narrows the view without inventing usage.
    const alphaOnly = await usageView({
      orgId,
      window,
      groupBy: "project",
      filter: { projects: [alpha.id as string] },
    });
    expect(alphaOnly.rows).toHaveLength(1);
    expect(alphaOnly.rows[0].quantity).toBe(300_000_000);

    // A filter that matches no meter yields nothing rather than everything.
    const noMeter = await usageView({
      orgId,
      window,
      filter: { meters: ["does.not.exist"] },
    });
    expect(noMeter.rows).toHaveLength(0);
    expect(noMeter.usageCents).toBe(0);
  });

  it("coarser granularity buckets to the same total", async () => {
    const { usageView, usageSummary } = await import("@/lib/usage.server");
    const summary = await usageSummary({
      orgId,
      window,
      includedCreditCents: 2000,
    });

    for (const granularity of ["daily", "weekly", "monthly"] as const) {
      const view = await usageView({ orgId, window, granularity });
      const total = view.buckets.reduce((sum, b) => sum + b.totalCents, 0);
      expect(total, granularity).toBe(summary.usageCents);
    }
  });

  it("freezes a closed period so re-pricing cannot move it", async () => {
    const { closePeriod, getPeriod, totalsFromSnapshot, markInvoiced } =
      await import("@/lib/billing-periods.server");

    const period = await closePeriod({ orgId, window, plan: "pro" });
    expect(period.status).toBe("closed");
    expect(period.periodStart).toBe("2026-03-01");
    expect(period.usageCents).toBeGreaterThan(2000);
    expect(period.creditAppliedCents).toBe(2000);
    expect(period.overageCents).toBe(period.usageCents - 2000);

    const snapshot = await getPeriod({ orgId, periodStart: "2026-03-01" });
    expect(snapshot).not.toBeNull();
    // The rate travelled with the line: this is what makes history stable.
    expect(snapshot!.lines[0].rate).toEqual({
      unitAmountCents: 100,
      per: 1_000_000,
      includedQuantity: 0,
    });
    const frozenTotal = snapshot!.lines.reduce((s, l) => s + l.costCents, 0);
    expect(frozenTotal).toBe(period.usageCents);
    expect(totalsFromSnapshot(snapshot!.period, snapshot!.lines).overageCents).toBe(
      period.overageCents,
    );

    // Once invoiced, closing again is a no-op: the period cannot be re-billed
    // or re-priced, which is what makes the Stripe webhook exactly-once.
    await markInvoiced({
      orgId,
      periodId: period.id,
      stripeInvoiceId: "in_test_123",
    });
    const again = await closePeriod({ orgId, window, plan: "free" });
    expect(again.status).toBe("invoiced");
    expect(again.usageCents).toBe(period.usageCents);
    expect(again.plan).toBe("pro");
    expect(again.stripeInvoiceId).toBe("in_test_123");
  });

  it("keeps a deleted project's usage attributed to it", async () => {
    const { usageView } = await import("@/lib/usage.server");
    const before = await usageView({ orgId, window, groupBy: "project" });
    const keys = before.rows.map((row) => row.key);

    await owner`DELETE FROM projects WHERE organization_id = ${orgId}::uuid AND slug = 'beta'`;

    const after = await usageView({ orgId, window, groupBy: "project" });
    // Same number of groups: the deleted project's usage stays its own,
    // rather than silently folding into the organization bucket.
    expect(after.rows.map((row) => row.key).sort()).toEqual(keys.sort());
    expect(
      after.rows.some((row) => row.label === "Deleted project"),
    ).toBe(true);
  });
});
