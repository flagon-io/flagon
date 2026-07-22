import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Enterprise metered overage billing, end to end against a real database.
 *
 * The guarantee: for a contracted org, a COVERED meter freezes as volume at
 * cost 0 (coordinated at renewal, never auto-charged), while a METERED meter
 * freezes its per-cycle overage as real cost - and the two are cleanly split so
 * the invoice bills only the metered part. Only a real close against Postgres
 * proves the snapshot carries the right modes and totals.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
  process.env.DATABASE_URL_OWNER &&
  process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("enterprise contract billing", () => {
  const stamp = Date.now();
  const slug = `contract-bill-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let orgId = "";

  let periods: typeof import("@/lib/billing-periods.server");
  let contracts: typeof import("@/lib/contracts.server");

  // A June cycle; usage lands inside it.
  const window = {
    from: new Date("2026-06-01T00:00:00Z"),
    to: new Date("2026-06-30T00:00:00Z"),
  };

  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 3 });
    ({ closePool } = await import("@/db/client"));
    periods = await import("@/lib/billing-periods.server");
    contracts = await import("@/lib/contracts.server");

    const [org] = await owner`
      INSERT INTO organizations (slug, name, plan)
      VALUES (${slug}, 'Contract Org', 'enterprise') RETURNING id`;
    orgId = org.id as string;

    // Contract: evaluations COVERED (term envelope), syncs METERED with 1M
    // included per cycle.
    await owner`
      INSERT INTO org_contracts (
        organization_id, term_start, term_end, meter_allowances,
        metered_allowances, status
      ) VALUES (
        ${orgId}::uuid, '2026-01-01', '2026-12-31',
        ${'{"flags.evaluations": 750000000}'}::jsonb,
        ${'{"flags.syncs": 1000000}'}::jsonb, 'active')`;

    // Usage in the cycle: 100M evaluations (covered), 3M syncs (2M over the 1M
    // included).
    await owner`
      INSERT INTO usage_rollups (organization_id, meter, day, quantity) VALUES
        (${orgId}::uuid, 'flags.evaluations', '2026-06-10'::date, 100000000),
        (${orgId}::uuid, 'flags.syncs', '2026-06-10'::date, 3000000)`;
  });

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM organizations WHERE slug = ${slug}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("freezes covered as volume/cost 0 and metered as overage", async () => {
    await periods.closePeriod({ orgId, window, plan: "enterprise" });
    const snapshot = await periods.getPeriod({
      orgId,
      periodStart: "2026-06-01",
    });
    expect(snapshot).not.toBeNull();

    const evals = snapshot!.lines.find(
      (l) => l.meterId === "flags.evaluations",
    );
    const syncs = snapshot!.lines.find((l) => l.meterId === "flags.syncs");

    // Covered: recorded as volume, never billed.
    expect(evals?.billingMode).toBe("covered");
    expect(evals?.costCents).toBe(0);
    expect(evals?.quantity).toBe(100000000);

    // Metered: 2M over the 1M included at $0.75/1M = 150 cents.
    expect(syncs?.billingMode).toBe("metered");
    expect(syncs?.rate.includedQuantity).toBe(1000000);
    expect(syncs?.costCents).toBe(150);
  });

  it("totals only the metered overage on the frozen snapshot", async () => {
    const snapshot = await periods.getPeriod({
      orgId,
      periodStart: "2026-06-01",
    });
    const totals = periods.totalsFromSnapshot(
      snapshot!.period,
      snapshot!.lines,
    );
    // The covered $0 contributes nothing; the period bills exactly the metered
    // overage.
    expect(totals.usageCents).toBe(150);
    expect(totals.overageCents).toBe(150);
  });

  it("prices the live metered usage the same way, covered excluded", async () => {
    const contract = await contracts.activeContract(orgId);
    const lines = await contracts.meteredUsage({ orgId, window, contract });
    // Only the metered meter appears; the covered one is not billed.
    expect(lines.map((l) => l.meterId)).toEqual(["flags.syncs"]);
    expect(lines[0].costCents).toBe(150);
    expect(lines[0].billingMode).toBe("metered");
  });
});
