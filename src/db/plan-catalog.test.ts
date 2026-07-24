import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";
import { METERS } from "@/lib/meters";

/**
 * The plan catalog, audited against the database.
 *
 * Two invariants, both of which fail silently in production if nothing checks
 * them, and both of which are cheap to check here.
 *
 * METER DRIFT. Meters are declared in code (src/lib/meters.ts) because they are
 * wired to instrumentation, and mirrored into a table (drizzle/0037) so the
 * operator console can read their labels without importing TypeScript. A mirror
 * nothing verifies is a mirror that drifts, and the failure mode is an editor
 * offering a meter that does not exist - or worse, omitting one that does, so a
 * plan silently grants nothing for a product customers are using.
 *
 * PLAN COHERENCE. A plan version is now the source of pricing, entitlements and
 * marketing copy at once, which means a badly-shaped row misprices customers
 * rather than just rendering oddly. The checks below are the ones where being
 * wrong costs money.
 */
const ownerUrl = process.env.DATABASE_URL_OWNER;
const canRun = Boolean(ownerUrl);

describe.skipIf(!canRun)("plan catalog", () => {
  let owner: ReturnType<typeof postgres>;

  beforeAll(() => {
    owner = postgres(ownerUrl as string, { max: 1 });
  });

  afterAll(async () => {
    await owner?.end();
  });

  it("mirrors every code-declared meter into the meters table", async () => {
    const rows = await owner`SELECT id, product, label, unit, status FROM meters`;
    const byId = new Map(rows.map((row) => [row.id as string, row]));

    for (const meter of METERS) {
      const row = byId.get(meter.id);
      expect(
        row,
        `meter "${meter.id}" is declared in src/lib/meters.ts but missing from the meters table. ` +
          "Add it in a migration - the operator console reads labels from there.",
      ).toBeDefined();
      if (!row) continue;

      expect(row.label, `${meter.id} label drifted`).toBe(meter.label);
      expect(row.unit, `${meter.id} unit drifted`).toBe(meter.unit);
      expect(row.product, `${meter.id} product drifted`).toBe(meter.product);
      expect(row.status, `${meter.id} status drifted`).toBe(meter.status);
    }
  });

  it("has no table meter that code does not declare", async () => {
    const rows = await owner`SELECT id FROM meters`;
    const declared = new Set(METERS.map((meter) => meter.id));
    for (const row of rows) {
      expect(
        declared.has(row.id as string),
        `meter "${row.id}" exists in the table but is not declared in src/lib/meters.ts. ` +
          "Nothing emits it, so plans referencing it grant nothing.",
      ).toBe(true);
    }
  });

  it("offers exactly one active version per plan", async () => {
    const rows = await owner`
      SELECT plan, count(*)::int AS n
      FROM plan_versions WHERE status = 'active'
      GROUP BY plan
    `;
    for (const row of rows) {
      expect(row.n, `plan "${row.plan}" has ${row.n} active versions`).toBe(1);
    }
    // Every plan a customer can be on must have somewhere to resolve from.
    expect(rows.map((row) => row.plan).sort()).toEqual(["free", "pro"]);
  });

  /**
   * The Hobby regression, as an invariant.
   *
   * An unbilled tier with an amount or a credit is the exact confusion this
   * redesign removed: it renders as "$0.00/month" beside real plans and implies
   * an invoice that will never arrive.
   */
  it("keeps unbilled plans free of prices and credits", async () => {
    const rows = await owner`
      SELECT plan, label, unit_amount_cents, included_credit_cents, stripe_price_id
      FROM plan_versions WHERE billable = false
    `;
    for (const row of rows) {
      expect(
        row.unit_amount_cents,
        `${row.label} is unbilled but carries an amount`,
      ).toBeNull();
      expect(
        row.included_credit_cents,
        `${row.label} is unbilled but carries a usage credit`,
      ).toBeNull();
      expect(
        row.stripe_price_id,
        `${row.label} is unbilled but links a Stripe price`,
      ).toBeNull();
    }
  });

  /**
   * An unbilled plan that does not refuse is a free plan with no ceiling, which
   * is a way to run production for nothing. Every meter it includes must cap.
   */
  it("caps every meter on an unbilled plan", async () => {
    const rows = await owner`
      SELECT v.label, m.meter, m.mode, m.hard_cap
      FROM plan_versions v
      JOIN plan_version_meters m ON m.plan_version_id = v.id
      WHERE v.billable = false AND m.mode = 'included'
    `;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(
        row.hard_cap,
        `${row.label} includes ${row.meter} with no hard cap: it can never be billed, so nothing stops it`,
      ).not.toBeNull();
    }
  });

  /** A half-written rate would silently price at the published rate instead. */
  it("stores plan rate overrides as complete pairs", async () => {
    const rows = await owner`
      SELECT v.label, m.meter, m.unit_amount_cents, m.per
      FROM plan_versions v
      JOIN plan_version_meters m ON m.plan_version_id = v.id
      WHERE (m.unit_amount_cents IS NULL) <> (m.per IS NULL)
    `;
    expect(
      rows.map((row) => `${row.label}/${row.meter}`),
      "a rate override needs both an amount and a per; half of one is ignored",
    ).toEqual([]);
  });

  it("gives every active version terms for every active meter", async () => {
    const rows = await owner`
      SELECT v.label, m.id AS meter
      FROM plan_versions v
      CROSS JOIN meters m
      WHERE v.status = 'active' AND m.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM plan_version_meters t
          WHERE t.plan_version_id = v.id AND t.meter = m.id
        )
    `;
    expect(
      rows.map((row) => `${row.label} is missing terms for ${row.meter}`),
      "a meter with no terms on a plan falls back to defaults nobody chose",
    ).toEqual([]);
  });

  it("points every organization at a version of the plan it is on", async () => {
    const rows = await owner`
      SELECT o.slug, o.plan, v.plan AS version_plan
      FROM organizations o
      JOIN plan_versions v ON v.id = o.plan_version_id
      WHERE v.plan <> o.plan
    `;
    expect(
      rows.map((row) => `${row.slug} is on ${row.plan} but pinned to ${row.version_plan}`),
      "a pin that disagrees with the plan column resolves to the wrong terms",
    ).toEqual([]);
  });
});
