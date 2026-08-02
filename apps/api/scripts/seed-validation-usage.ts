/**
 * Seed the validation org with realistic usage so the console Usage page can be
 * eyeballed in the browser against real-looking data.
 *
 * It ALWAYS scrubs the org's usage first (clean baseline), then fills the trailing
 * N days with free flag checks (spread across the org's flags, environments and a
 * couple of OFREP reasons, so every lens has something to show) and billable
 * events (landing around the Pro credit's 1M, so the usage bar reads
 * "partly used", not "over"). Config — flags, keys — is never touched.
 *
 * Asserts the validation org exists and fails loudly if not. Runs as the OWNER DB
 * role via withOrg (use DATABASE_URL, as the other scripts do).
 *
 * Usage (from apps/api):
 *   npm run seed:usage                 # scrub + seed the trailing 30 days
 *   npm run seed:usage -- --days 14    # a shorter window
 *   npm run seed:usage -- --scrub-only # just wipe it back to a clean baseline
 */
import { withOrg } from "../src/db/tenant.js";
import { environments, flags, flagEvalRollups } from "../src/db/schema.js";
import { ingestEvents, compactUsageEvents } from "../src/usage/events.js";
import { resolveValidationOrg, scrubOrgUsage } from "../src/usage/validation-org.js";
import { sql } from "drizzle-orm";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const DAY_MS = 24 * 60 * 60 * 1000;
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

async function main() {
  const days = Math.max(1, Number(arg("days") ?? 30));
  const scrubOnly = hasFlag("scrub-only");

  const org = await resolveValidationOrg();
  console.log(`validation org: ${org.slug} (${org.plan}) ${org.id}`);

  await scrubOrgUsage(org.id);
  console.log("scrubbed existing usage (clean baseline)");
  if (scrubOnly) return;

  // Days to fill: today back through N-1 days ago, as UTC day strings + epochs.
  const now = Date.now();
  const daysList = Array.from({ length: days }, (_, i) => {
    const ms = now - (days - 1 - i) * DAY_MS;
    return { day: new Date(ms).toISOString().slice(0, 10), ms };
  });

  let totalChecks = 0;
  let totalEvents = 0;

  await withOrg(org.id, async (tx) => {
    const flagRows = await tx.select({ id: flags.id }).from(flags);
    const envRows = await tx.select({ id: environments.id }).from(environments);
    if (flagRows.length === 0 || envRows.length === 0) {
      console.warn(
        `note: org has ${flagRows.length} flags / ${envRows.length} environments; seeding events only (flag checks need both).`,
      );
    }

    // Free flag checks: per flag x env x day, split across two OFREP reasons and
    // their served variant, so the by-flag / by-environment / by-reason lenses
    // all have shape. Upsert so re-running accumulates rather than duplicating.
    const rows: (typeof flagEvalRollups.$inferInsert)[] = [];
    for (const { day } of daysList) {
      for (const f of flagRows) {
        for (const e of envRows) {
          const matched = randInt(1500, 6000);
          const fallthrough = randInt(200, 1500);
          totalChecks += matched + fallthrough;
          rows.push({
            organizationId: org.id,
            flagId: f.id,
            environmentId: e.id,
            day,
            variantKey: "on",
            reason: "TARGETING_MATCH",
            count: matched,
          });
          rows.push({
            organizationId: org.id,
            flagId: f.id,
            environmentId: e.id,
            day,
            variantKey: "off",
            reason: "DEFAULT",
            count: fallthrough,
          });
        }
      }
    }
    if (rows.length > 0) {
      await tx
        .insert(flagEvalRollups)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            flagEvalRollups.flagId,
            flagEvalRollups.environmentId,
            flagEvalRollups.day,
            flagEvalRollups.variantKey,
            flagEvalRollups.reason,
          ],
          set: { count: sql`${flagEvalRollups.count} + excluded.count`, updatedAt: sql`now()` },
        });
    }
  });

  // Billable events through the REAL durable path: one idempotent receipt per day
  // (usage_events, keyed so a re-run after scrub is clean), then a single
  // exactly-once compaction folds them into the rollups — the same pipeline
  // POST /ofrep/v1/exposures drives. So the seeded rollups are backed by receipts
  // and reconcile cleanly, instead of being written straight into the rollup table.
  // ~25k-55k/day -> roughly 1M-1.6M/month, around the Pro $50 credit (1M) so the
  // usage bar shows a meaningful credit drawdown into light overage.
  for (const { day, ms } of daysList) {
    const n = randInt(25_000, 55_000);
    totalEvents += n;
    await ingestEvents(org.id, n, {
      source: "flags.exposure",
      idempotencyKey: `seed-${day}`,
      atMs: ms,
    });
  }
  await compactUsageEvents(org.id);

  console.log(
    `seeded ${days} days: ${totalChecks.toLocaleString()} flag checks (free), ${totalEvents.toLocaleString()} events`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[seed:usage] failed:", err);
    process.exit(1);
  });
