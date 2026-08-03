import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * End-to-end proof of the experiments spine against the REAL tables:
 * seed a flag + variants + a running experiment + a conversion metric, attribute a
 * batch of exposures to arms, record goal events, then compute the statistical
 * readout and prove billing reconciles for the experiments.metric source.
 *
 * Runs only where a migrated database is reachable (CI; or locally with
 * DATABASE_URL pointing at a migrated DB); skipped otherwise. Fixtures seed
 * through withOrg() so it passes under the restricted RLS-enforcing role.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("experiments spine (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let attributeExposures: typeof import("./ingest.js")["attributeExposures"];
  let recordMetricEvents: typeof import("./ingest.js")["recordMetricEvents"];
  let analyzeExperiment: typeof import("./analyze.js")["analyzeExperiment"];
  let ingestEvents: typeof import("../usage/events.js")["ingestEvents"];
  let compactUsageEvents: typeof import("../usage/events.js")["compactUsageEvents"];
  let reconcileUsage: typeof import("../usage/events.js")["reconcileUsage"];

  const orgId = randomUUID();
  let envId: string;
  let flagId: string;
  let experimentId: string;
  let metricId: string;

  const CONTROL_UNITS = 200;
  const TREATMENT_UNITS = 200;
  const CONTROL_CONVERSIONS = 20; // 10%
  const TREATMENT_CONVERSIONS = 40; // 20%

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ attributeExposures, recordMetricEvents } = await import("./ingest.js"));
    ({ analyzeExperiment } = await import("./analyze.js"));
    ({ ingestEvents, compactUsageEvents, reconcileUsage } = await import(
      "../usage/events.js"
    ));

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

      const [exp] = await tx
        .insert(t.experiments)
        .values({
          organizationId: orgId,
          key: "checkout-color",
          name: "Checkout color",
          flagId: flag.id,
          environmentId: envId,
          status: "running",
          controlVariantKey: "off",
          primaryMetricId: metric.id,
        })
        .returning();
      experimentId = exp.id;

      await tx.insert(t.experimentMetricLinks).values({
        organizationId: orgId,
        experimentId: exp.id,
        metricId: metric.id,
        role: "primary",
      });
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.experiments).where(eq(t.experiments.organizationId, orgId));
      await tx.delete(t.experimentMetrics).where(eq(t.experimentMetrics.organizationId, orgId));
      await tx.delete(t.experimentMetricEvents).where(eq(t.experimentMetricEvents.organizationId, orgId));
      await tx.delete(t.usageEvents).where(eq(t.usageEvents.organizationId, orgId));
      await tx.delete(t.usageEventRollups).where(eq(t.usageEventRollups.organizationId, orgId));
      await tx.delete(t.usageCounters).where(eq(t.usageCounters.organizationId, orgId));
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
  });

  it("attributes exposures to the running experiment's arms", async () => {
    const exposures = [
      ...Array.from({ length: CONTROL_UNITS }, (_, i) => ({
        key: "checkout",
        variant: "off",
        targetingKey: `c${i}`,
      })),
      ...Array.from({ length: TREATMENT_UNITS }, (_, i) => ({
        key: "checkout",
        variant: "on",
        targetingKey: `t${i}`,
      })),
    ];
    const res = await attributeExposures(orgId, envId, exposures);
    expect(res.attributed).toBe(CONTROL_UNITS + TREATMENT_UNITS);

    // Re-sending the same batch is idempotent per unit (assignment frozen).
    const again = await attributeExposures(orgId, envId, exposures);
    expect(again.attributed).toBe(0);
  });

  it("records goal events and computes a correct, significant readout", async () => {
    const events = [
      ...Array.from({ length: CONTROL_CONVERSIONS }, (_, i) => ({
        name: "purchase",
        targetingKey: `c${i}`,
        value: 1,
      })),
      ...Array.from({ length: TREATMENT_CONVERSIONS }, (_, i) => ({
        name: "purchase",
        targetingKey: `t${i}`,
        value: 1,
      })),
    ];
    await recordMetricEvents(orgId, events);

    const results = await analyzeExperiment(orgId, experimentId);
    expect(results).not.toBeNull();
    expect(results!.totalUnits).toBe(CONTROL_UNITS + TREATMENT_UNITS);

    const primary = results!.metrics.find((m) => m.role === "primary")!;
    expect(primary.metricKey).toBe("purchase");
    const control = primary.analysis.variants.find((v) => v.isControl)!;
    const treatment = primary.analysis.variants.find((v) => !v.isControl)!;

    // 20/200 = 10% vs 40/200 = 20%.
    expect(control.estimate).toBeCloseTo(0.1, 5);
    expect(treatment.estimate).toBeCloseTo(0.2, 5);
    expect(treatment.relativeLift!).toBeCloseTo(1.0, 5); // +100%
    expect(treatment.pValue!).toBeLessThan(0.01);
    expect(treatment.significant).toBe(true);
    expect(treatment.probabilityToBeatControl!).toBeGreaterThan(0.99);
    // Even 200/200 split -> SRM healthy.
    expect(primary.analysis.srm!.healthy).toBe(true);
  });

  it("meters goal events through the durable spine as experiments.metric and reconciles", async () => {
    const total = CONTROL_CONVERSIONS + TREATMENT_CONVERSIONS;
    const ing = await ingestEvents(orgId, total, {
      source: "experiments.metric",
      idempotencyKey: "test-metric-batch",
    });
    expect(ing.recorded).toBe(total);

    // A retry of the same batch is a no-op (exactly-once).
    const retry = await ingestEvents(orgId, total, {
      source: "experiments.metric",
      idempotencyKey: "test-metric-batch",
    });
    expect(retry.duplicate).toBe(true);

    await compactUsageEvents(orgId);
    const recon = await reconcileUsage(orgId);
    expect(recon.ok).toBe(true);

    const rollup = await withOrg(orgId, (tx) =>
      tx
        .select()
        .from(t.usageEventRollups)
        .where(eq(t.usageEventRollups.organizationId, orgId)),
    );
    const metricLine = rollup.find((r) => r.source === "experiments.metric");
    expect(metricLine?.count).toBe(total);
  });
});
