/**
 * Seed the validation org with a full, realistic experiments + analytics story so
 * the console can be eyeballed and played with against real-looking data:
 *
 *   - a demo boolean flag ("qa-checkout-button") with on/off variants, enabled in
 *     Production with a default (control) variant;
 *   - 14 days of evaluation rollups so the flag list shows checks/hr + pass rate +
 *     a sparkline, and the detail shows the Evaluations panel;
 *   - two metrics (qa-checkout-completed conversion, qa-revenue sum);
 *   - ~8k attributed exposures split off/on with a real +40% lift, and matching
 *     goal events, so flag IMPACT and the experiment RESULTS are populated and
 *     SEQUENTIALLY significant (the always-valid "safe to call it" state);
 *   - the metric watched on the flag (always-on impact), and a running experiment
 *     "qa-checkout-color" with a primary + secondary metric.
 *
 * Idempotent: only the qa-* demo entities are removed and recreated; your real
 * flags/metrics/experiments are untouched. Runs as the OWNER DB role via withOrg
 * (use DATABASE_URL, as the other scripts do).
 *
 * Usage (from apps/api):
 *   npm run seed:experiments
 *   npm run seed:experiments -- --scrub-only
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { withOrg } from "../src/db/tenant.js";
import {
  environments,
  experiments,
  experimentMetricLinks,
  experimentMetrics,
  flagEnvironments,
  flagEvalRollups,
  flagMetricLinks,
  flagVariants,
  flags,
  holdouts,
} from "../src/db/schema.js";
import { attributeExposures, recordMetricEvents } from "../src/experiments/ingest.js";
import { resolveValidationOrg } from "../src/usage/validation-org.js";

const hasFlag = (name: string) => process.argv.includes(`--${name}`);
const FLAG_KEY = "qa-checkout-button";
const M_CONV = "qa-checkout-completed";
const M_REV = "qa-revenue";
const EXP_KEY = "qa-checkout-color";
const CONTROL_UNITS = 4000;
const TREATMENT_UNITS = 4000;
const CONTROL_RATE = 0.1; // 10%
const TREATMENT_RATE = 0.14; // 14% → +40% lift, sequentially significant at this n
const DAY_MS = 24 * 60 * 60 * 1000;
const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

async function main() {
  const org = await resolveValidationOrg();
  console.log(`validation org: ${org.slug} (${org.plan}) ${org.id}`);

  await withOrg(org.id, async (tx) => {
    // --- Scrub prior demo data (qa-* only) ---------------------------------
    await tx.delete(experiments).where(eq(experiments.key, EXP_KEY));
    await tx.delete(experimentMetrics).where(inArray(experimentMetrics.key, [M_CONV, M_REV]));
    await tx.execute(
      sql`delete from experiment_metric_events where organization_id = ${org.id} and event_name in ('qa_checkout','qa_revenue')`,
    );
    await tx.delete(holdouts).where(eq(holdouts.key, "qa-global-holdout"));
    await tx.delete(flags).where(eq(flags.key, FLAG_KEY)); // cascades variants/exposures/links/rollups
  });
  console.log("scrubbed prior qa-* demo data");
  if (hasFlag("scrub-only")) return;

  const seeded = await withOrg(org.id, async (tx) => {
    const [prod] = await tx
      .select({ id: environments.id })
      .from(environments)
      .where(and(eq(environments.organizationId, org.id), eq(environments.key, "production")))
      .limit(1);
    if (!prod) throw new Error("Production environment not found in the validation org.");

    // --- Flag + variants + production config (default = off = control) ------
    const [flag] = await tx
      .insert(flags)
      .values({ organizationId: org.id, key: FLAG_KEY, name: "QA Checkout Button", type: "boolean" })
      .returning();
    const [on] = await tx
      .insert(flagVariants)
      .values({ organizationId: org.id, flagId: flag!.id, key: "on", value: true })
      .returning();
    const [off] = await tx
      .insert(flagVariants)
      .values({ organizationId: org.id, flagId: flag!.id, key: "off", value: false })
      .returning();
    await tx.insert(flagEnvironments).values({
      organizationId: org.id,
      flagId: flag!.id,
      environmentId: prod!.id,
      enabled: true,
      defaultVariantId: off!.id,
      offVariantId: off!.id,
    });

    // --- Evaluation rollups: 14 days of checks with a ~55% pass rate --------
    const now = Date.now();
    const rollupRows = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date(now - d * DAY_MS).toISOString().slice(0, 10);
      const total = randInt(400, 1200);
      const onCount = Math.round(total * (0.5 + Math.random() * 0.1)); // ~50-60% pass
      rollupRows.push(
        { organizationId: org.id, flagId: flag!.id, environmentId: prod!.id, day, variantKey: "on", reason: "SPLIT", count: onCount },
        { organizationId: org.id, flagId: flag!.id, environmentId: prod!.id, day, variantKey: "off", reason: "SPLIT", count: total - onCount },
      );
    }
    await tx.insert(flagEvalRollups).values(rollupRows);

    // --- Metrics (conversion + revenue sum) ---------------------------------
    const [mConv] = await tx
      .insert(experimentMetrics)
      .values({
        organizationId: org.id,
        key: M_CONV,
        name: "Checkout completed",
        type: "conversion",
        eventName: "qa_checkout",
        direction: "increase",
      })
      .returning();
    const [mRev] = await tx
      .insert(experimentMetrics)
      .values({
        organizationId: org.id,
        key: M_REV,
        name: "Revenue per user",
        type: "sum",
        eventName: "qa_revenue",
        direction: "increase",
      })
      .returning();

    // --- Watch the conversion metric on the flag (always-on impact) ---------
    await tx.insert(flagMetricLinks).values({
      organizationId: org.id,
      flagId: flag!.id,
      metricId: mConv!.id,
    });

    // --- Experiment on the flag (control = off), primary + secondary --------
    const [exp] = await tx
      .insert(experiments)
      .values({
        organizationId: org.id,
        key: EXP_KEY,
        name: "Checkout button color",
        hypothesis: "A green checkout button lifts completed checkouts.",
        flagId: flag!.id,
        environmentId: prod!.id,
        status: "running",
        controlVariantKey: "off",
        primaryMetricId: mConv!.id,
        cuped: true, // showcase CUPED; the pre-exposure history below gives it signal
        startedAt: new Date(now - 6 * DAY_MS),
      })
      .returning();
    await tx.insert(experimentMetricLinks).values([
      { organizationId: org.id, experimentId: exp!.id, metricId: mConv!.id, role: "primary" },
      { organizationId: org.id, experimentId: exp!.id, metricId: mRev!.id, role: "secondary" },
    ]);

    // A global holdout so the Holdouts UI is populated too.
    await tx.insert(holdouts).values({
      organizationId: org.id,
      environmentId: prod!.id,
      key: "qa-global-holdout",
      name: "Global holdout",
      description: "10% of users held out of all experiments to measure program lift.",
      percentage: 10,
      status: "active",
    });

    return { envId: prod!.id };
  });

  // --- Exposures (attributed) + goal events, via the real ingest path -------
  const exposures = [
    ...Array.from({ length: CONTROL_UNITS }, (_, i) => ({ key: FLAG_KEY, variant: "off", targetingKey: `qa-c${i}` })),
    ...Array.from({ length: TREATMENT_UNITS }, (_, i) => ({ key: FLAG_KEY, variant: "on", targetingKey: `qa-t${i}` })),
  ];
  const res = await attributeExposures(org.id, seeded.envId, exposures);
  console.log(`attributed ${res.attributed} exposures`);

  const controlConv = Math.round(CONTROL_UNITS * CONTROL_RATE);
  const treatConv = Math.round(TREATMENT_UNITS * TREATMENT_RATE);
  const events = [
    ...Array.from({ length: controlConv }, (_, i) => ({ name: "qa_checkout", targetingKey: `qa-c${i}` })),
    ...Array.from({ length: treatConv }, (_, i) => ({ name: "qa_checkout", targetingKey: `qa-t${i}` })),
    // Revenue per converter (control ~ $45 avg, treatment ~ $52 avg).
    ...Array.from({ length: controlConv }, (_, i) => ({ name: "qa_revenue", targetingKey: `qa-c${i}`, value: randInt(30, 60) })),
    ...Array.from({ length: treatConv }, (_, i) => ({ name: "qa_revenue", targetingKey: `qa-t${i}`, value: randInt(35, 70) })),
  ];
  await recordMetricEvents(org.id, events);
  console.log(`recorded ${events.length} goal events (${controlConv} + ${treatConv} conversions)`);

  // --- Pre-exposure history (the CUPED covariate) --------------------------
  // Give converters a much higher chance of a PRIOR checkout than non-converters,
  // so pre-conversion (X) correlates with post-conversion (Y). CUPED then removes
  // that baseline variance. Backdated before first exposure via `timestamp`.
  const preTs = Date.now() - 2 * DAY_MS;
  const preEvents: { name: string; targetingKey: string; timestamp: number; value?: number }[] = [];
  for (const [prefix, convCount, totalCount] of [
    ["qa-c", controlConv, CONTROL_UNITS],
    ["qa-t", treatConv, TREATMENT_UNITS],
  ] as const) {
    for (let i = 0; i < totalCount; i++) {
      const converted = i < convCount;
      if (Math.random() < (converted ? 0.7 : 0.15)) {
        preEvents.push({ name: "qa_checkout", targetingKey: `${prefix}${i}`, timestamp: preTs });
      }
    }
  }
  await recordMetricEvents(org.id, preEvents);
  console.log(`recorded ${preEvents.length} pre-exposure events (CUPED covariate)`);

  console.log(
    `\nSeeded. In the console (validation org "${org.slug}"):\n` +
      `  • Flags → ${FLAG_KEY}: checks/hr + pass rate + Impact (significant)\n` +
      `  • Experiments → ${EXP_KEY}: results, sequentially significant\n` +
      `  • Experiments → Metrics: Checkout completed, Revenue per user`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
