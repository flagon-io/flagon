import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Regression proof for the enrollment-window fixes (migration 0035):
 *
 *   1. NO CONTAMINATION FROM PRE-EXPERIMENT HISTORY. An experiment must analyze
 *      only units enrolled DURING its run, never the flag's prior traffic. Before
 *      0035 an experiment was a retroactive view over flag_exposures and opened
 *      already decided off pre-experiment data ("auto-fail on previous data").
 *
 *   2. REPEAT EXPERIMENTS RE-ENROLL. Because flag_exposures freezes a unit for the
 *      flag's whole life, a unit that saw the flag under experiment #1 could never
 *      enroll in a later experiment #2 on the same flag — repeats starved. Per-
 *      experiment enrollment gives each experiment its own fresh enrollment set.
 *
 * DB-gated (CI, or local DATABASE_URL); seeds a throwaway org and cleans up.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("experiment enrollment window (integration)", () => {
  let db: (typeof import("../db/client.js"))["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let attributeExposures: (typeof import("./ingest.js"))["attributeExposures"];
  let recordMetricEvents: (typeof import("./ingest.js"))["recordMetricEvents"];
  let analyzeExperiment: (typeof import("./analyze.js"))["analyzeExperiment"];

  const orgId = randomUUID();
  let envId: string;
  let flagId: string;
  let metricId: string;

  const exposuresFor = (prefix: string, variant: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ key: "checkout", variant, targetingKey: `${prefix}${i}` }));
  const conversionsFor = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: "purchase", targetingKey: `${prefix}${i}` }));

  async function makeExperiment(key: string): Promise<string> {
    return withOrg(orgId, async (tx) => {
      const [exp] = await tx
        .insert(t.experiments)
        .values({
          organizationId: orgId,
          key,
          name: key,
          flagId,
          environmentId: envId,
          status: "draft",
          controlVariantKey: "off",
          primaryMetricId: metricId,
        })
        .returning();
      await tx.insert(t.experimentMetricLinks).values({
        organizationId: orgId,
        experimentId: exp.id,
        metricId,
        role: "primary",
        metricType: "conversion",
        eventName: "purchase",
        direction: "increase",
      });
      return exp.id;
    });
  }
  const setStatus = (id: string, status: string) =>
    withOrg(orgId, (tx) =>
      tx.update(t.experiments).set({ status, startedAt: new Date() }).where(eq(t.experiments.id, id)),
    );

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ attributeExposures, recordMetricEvents } = await import("./ingest.js"));
    ({ analyzeExperiment } = await import("./analyze.js"));

    await withOrg(orgId, async (tx) => {
      const [env] = await tx
        .insert(t.environments)
        .values({ organizationId: orgId, key: "production", name: "Production" })
        .returning();
      envId = env.id;
      const [flag] = await tx
        .insert(t.flags)
        .values({ organizationId: orgId, key: "checkout", name: "Checkout", type: "boolean" })
        .returning();
      flagId = flag.id;
      await tx.insert(t.flagVariants).values([
        { organizationId: orgId, flagId: flag.id, key: "on", value: true },
        { organizationId: orgId, flagId: flag.id, key: "off", value: false },
      ]);
      const [metric] = await tx
        .insert(t.experimentMetrics)
        .values({
          organizationId: orgId,
          key: "purchase",
          name: "Purchase",
          type: "conversion",
          eventName: "purchase",
          direction: "increase",
        })
        .returning();
      metricId = metric.id;
    });
  });

  afterAll(async () => {
    if (!db) return;
    // Cascades clean experiment_exposures / metric_links / flag_exposures.
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.experiments).where(eq(t.experiments.organizationId, orgId));
      await tx.delete(t.experimentMetrics).where(eq(t.experimentMetrics.organizationId, orgId));
      await tx.delete(t.experimentMetricEvents).where(eq(t.experimentMetricEvents.organizationId, orgId));
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
  });

  it("does NOT enroll (or count) pre-experiment traffic — only units seen while running", async () => {
    const expId = await makeExperiment("checkout-v1");

    // PRE-HISTORY: heavy, lopsided traffic BEFORE the experiment runs. If this
    // leaked in it would decide the experiment instantly. The experiment is draft,
    // so nothing should enroll.
    const preExposures = [
      ...exposuresFor("old-c", "off", 100),
      ...exposuresFor("old-t", "on", 100),
    ];
    const preAttr = await attributeExposures(orgId, envId, preExposures);
    expect(preAttr.attributed).toBe(200); // flag_exposures still records (always-on)
    expect(preAttr.enrolled).toBe(0); // but NOTHING enrolls into a draft experiment
    // Every pre-history treatment unit "converts", none of the control — a fake +∞ lift.
    await recordMetricEvents(orgId, conversionsFor("old-t", 100));

    // Now the experiment goes live.
    await setStatus(expId, "running");

    // IN-WINDOW traffic: a clean, balanced 10% vs 20% test on fresh units.
    const liveAttr = await attributeExposures(orgId, envId, [
      ...exposuresFor("new-c", "off", 200),
      ...exposuresFor("new-t", "on", 200),
    ]);
    expect(liveAttr.enrolled).toBe(400); // fresh units enroll into the running experiment
    await recordMetricEvents(orgId, [
      ...conversionsFor("new-c", 20), // 10%
      ...conversionsFor("new-t", 40), // 20%
    ]);

    const res = (await analyzeExperiment(orgId, expId))!;
    // Only the 400 in-window units — the 200 pre-history units are excluded.
    expect(res.totalUnits).toBe(400);
    const primary = res.metrics.find((m) => m.role === "primary")!;
    const control = primary.analysis.variants.find((v) => v.isControl)!;
    const treatment = primary.analysis.variants.find((v) => !v.isControl)!;
    expect(control.units).toBe(200);
    expect(treatment.units).toBe(200);
    // The clean 10% / 20% — NOT skewed by the lopsided pre-history conversions.
    expect(control.estimate).toBeCloseTo(0.1, 5);
    expect(treatment.estimate).toBeCloseTo(0.2, 5);
  });

  it("re-enrolls the SAME units into a repeat experiment on the same flag", async () => {
    // A second experiment on the same flag, started fresh. Units that already saw
    // the flag under v1 (old-* and new-*) must be able to enroll again in v2.
    const v2 = await makeExperiment("checkout-v2");
    await setStatus(v2, "running");

    const reused = [
      ...exposuresFor("new-c", "off", 200), // same units as v1's control arm
      ...exposuresFor("new-t", "on", 200), // same units as v1's treatment arm
    ];
    const attr = await attributeExposures(orgId, envId, reused);
    // flag_exposures is frozen per flag (already recorded these) so attributed=0,
    // but the REPEAT experiment enrolls them fresh — the starvation bug is gone.
    expect(attr.attributed).toBe(0);
    expect(attr.enrolled).toBe(400);

    const res = (await analyzeExperiment(orgId, v2))!;
    expect(res.totalUnits).toBe(400);
  });
});
