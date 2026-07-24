// Local development fixtures: a set of organizations that exercise every shape
// the billing model can take, plus usage to price them against.
//
// WHY THIS EXISTS. The interesting states in this system are combinations -
// an unbilled tier at its ceiling, a Pro org inside its credit, a Pro org in
// overage, an org grandfathered on a superseded plan version. Reaching any of
// them by clicking takes several minutes and reaching all of them takes an
// afternoon, so nobody does, and the console's edge cases go unlooked at.
//
// DESTRUCTIVE, and deliberately awkward to point at anything real:
//   - refuses unless the database looks local (or --force is passed)
//   - only ever deletes orgs carrying the seed marker in their metadata
//
// Usage:
//   node scripts/seed-dev.mjs                 # create/refresh the fixtures
//   node scripts/seed-dev.mjs --reset         # delete them first, then create
//   node scripts/seed-dev.mjs --reset --only  # just delete them
import { config } from "dotenv";
import postgres from "postgres";
import { resolveOwnerUrl } from "./db-urls.mjs";

config({ path: [".env.local", ".env"] });

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const deleteOnly = args.includes("--only");
const force = args.includes("--force");

const url = resolveOwnerUrl();
if (!url) {
  console.error("No owner database URL set.");
  process.exit(1);
}

// The guard that makes this safe to leave in the repo. A seeded "test org" in
// production is not a nuisance, it is a customer-visible mistake with billing
// rows attached.
const isLocal = /@(localhost|127\.0\.0\.1|postgres)[:/]/.test(url);
if (!isLocal && !force) {
  console.error(
    "This database does not look local.\n" +
      "  Seeding writes fake organizations and usage; refusing to touch a remote database.\n" +
      "  Pass --force only if you are certain.",
  );
  process.exit(1);
}

/** Every seeded row carries this, so cleanup can never catch a real org. */
const MARKER = "flagon-dev-seed";

const sql = postgres(url, { max: 1 });

/**
 * The fixtures.
 *
 * Each one exists to make a DIFFERENT thing visible in the console, noted
 * against it - a fixture that duplicates another's state is just slower tests.
 */
const ORGS = [
  {
    slug: "dev-hobby",
    name: "Hobby Hacker",
    plan: "free",
    // The ordinary free tier: well inside its ceiling, never billed.
    usage: { "flags.evaluations": 1_200_000, "flags.syncs": 400_000 },
  },
  {
    slug: "dev-hobby-capped",
    name: "Hobby At The Ceiling",
    plan: "free",
    // Past its hard cap. Proves the console shows a refusal state rather than
    // an invoice, which is the whole point of an unbilled tier.
    usage: { "flags.evaluations": 11_000_000, "flags.syncs": 6_000_000 },
  },
  {
    slug: "dev-pro",
    name: "Pro Standard",
    plan: "pro",
    subscription: true,
    // Inside the included credit: priced, but nothing owed beyond the fee.
    usage: { "flags.evaluations": 8_000_000, "flags.syncs": 12_000_000 },
  },
  {
    slug: "dev-pro-overage",
    name: "Pro In Overage",
    plan: "pro",
    subscription: true,
    // Well past the credit. The row margin actually cares about.
    usage: { "flags.evaluations": 140_000_000, "flags.syncs": 80_000_000 },
  },
  {
    slug: "dev-legacy",
    name: "Grandfathered Customer",
    plan: "pro",
    subscription: true,
    // Pinned to a superseded version, so "who is on legacy pricing?" has an
    // answer to show and the pin's behaviour is observable.
    legacy: true,
    usage: { "flags.evaluations": 25_000_000, "flags.syncs": 30_000_000 },
  },
];

async function removeSeeded() {
  const rows = await sql`
    DELETE FROM organizations
    WHERE metadata LIKE ${"%" + MARKER + "%"}
    RETURNING slug
  `;
  return rows.map((row) => row.slug);
}

/**
 * A legacy Pro version to strand one fixture on.
 *
 * Created as 'legacy' directly rather than published-then-superseded: this is a
 * fixture of the END STATE, and going through the transition would also demote
 * whatever version the developer is currently working on.
 */
async function ensureLegacyVersion() {
  const [existing] = await sql`
    SELECT id FROM plan_versions WHERE label = 'Pro 2024 (seed)' LIMIT 1
  `;
  if (existing) return existing.id;

  const [row] = await sql`
    INSERT INTO plan_versions (
      plan, version, status, label, display_name, billable,
      unit_amount_cents, interval, included_credit_cents,
      tagline, features, listed, self_serve, sort_order, note
    ) VALUES (
      'pro', 0, 'legacy', 'Pro 2024 (seed)', 'Pro', true,
      1000, 'month', 1000,
      'The old Pro terms.', '["{credit} of included usage"]'::jsonb,
      false, false, 20, ${"Seeded fixture (" + MARKER + ")"}
    )
    RETURNING id
  `;

  // Half the current allowances, so the difference from the live version is
  // obvious at a glance in the console.
  await sql`
    INSERT INTO plan_version_meters (plan_version_id, meter, mode, included_quantity)
    VALUES
      (${row.id}, 'flags.evaluations', 'included', 0),
      (${row.id}, 'flags.syncs', 'included', 25000000)
    ON CONFLICT (plan_version_id, meter) DO NOTHING
  `;
  return row.id;
}

/** Usage spread across the current month, so charts have a shape. */
async function seedUsage(orgId, usage) {
  for (const [meter, total] of Object.entries(usage)) {
    // Fourteen days, front-loaded slightly, summing to exactly `total` - a flat
    // line would hide any bug in per-day bucketing.
    const days = 14;
    const weights = Array.from({ length: days }, (_, i) => days - i * 0.5);
    const sum = weights.reduce((a, b) => a + b, 0);
    let remaining = total;

    for (let i = 0; i < days; i += 1) {
      const quantity =
        i === days - 1 ? remaining : Math.floor((total * weights[i]) / sum);
      remaining -= quantity;
      if (quantity <= 0) continue;
      await sql`
        INSERT INTO usage_rollups (id, organization_id, meter, day, quantity)
        VALUES (
          uuid_generate_v7(), ${orgId}::uuid, ${meter},
          (CURRENT_DATE - ${i}::int), ${quantity}
        )
        ON CONFLICT DO NOTHING
      `;
    }
  }
}

try {
  if (reset || deleteOnly) {
    const removed = await removeSeeded();
    console.log(
      removed.length
        ? `Removed ${removed.length} seeded org(s): ${removed.join(", ")}`
        : "Nothing to remove.",
    );
    if (deleteOnly) process.exit(0);
  }

  const legacyVersionId = await ensureLegacyVersion();
  const created = [];

  for (const fixture of ORGS) {
    const [version] = await sql`
      SELECT id FROM plan_versions
      WHERE plan = ${fixture.plan} AND status = 'active' LIMIT 1
    `;
    const versionId = fixture.legacy ? legacyVersionId : version?.id ?? null;

    const [org] = await sql`
      INSERT INTO organizations (
        slug, name, plan, plan_version_id, metadata,
        current_period_start, current_period_end,
        stripe_customer_id, stripe_subscription_id
      ) VALUES (
        ${fixture.slug}, ${fixture.name}, ${fixture.plan},
        ${versionId}::uuid,
        ${JSON.stringify({ seed: MARKER })},
        date_trunc('month', now()),
        date_trunc('month', now()) + interval '1 month',
        ${fixture.subscription ? `cus_seed_${fixture.slug}` : null},
        ${fixture.subscription ? `sub_seed_${fixture.slug}` : null}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        plan = EXCLUDED.plan,
        plan_version_id = EXCLUDED.plan_version_id,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING id
    `;

    await seedUsage(org.id, fixture.usage);
    created.push(fixture.slug);
  }

  console.log(`\nSeeded ${created.length} organizations:`);
  for (const fixture of ORGS) {
    console.log(`  ${fixture.slug.padEnd(20)} ${fixture.plan}`);
  }
  console.log(
    "\nRemove them with: node scripts/seed-dev.mjs --reset --only",
  );
} catch (error) {
  console.error(`\nFailed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
