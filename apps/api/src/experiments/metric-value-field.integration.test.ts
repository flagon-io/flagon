import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Proves the "most correct" value model for sum/mean metrics: a metric's
 * `value_field` (a dot-path) extracts the number from the event PROPERTIES at
 * analysis time, and an event sent with a direct `value` (no properties) falls
 * back to that value. Both paths land in one experiment.
 *
 * DB-gated (CI, or local DATABASE_URL); seeds a throwaway org and cleans up.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("metric value_field extraction (integration)", () => {
  let db: (typeof import("../db/client.js"))["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let attributeExposures: (typeof import("./ingest.js"))["attributeExposures"];
  let recordMetricEvents: (typeof import("./ingest.js"))["recordMetricEvents"];
  let analyzeExperiment: (typeof import("./analyze.js"))["analyzeExperiment"];

  const orgId = randomUUID();
  let envId: string;
  let experimentId: string;

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
      await tx.insert(t.flagVariants).values([
        { organizationId: orgId, flagId: flag.id, key: "on", value: true },
        { organizationId: orgId, flagId: flag.id, key: "off", value: false },
      ]);
      const [metric] = await tx
        .insert(t.experimentMetrics)
        .values({
          organizationId: orgId,
          key: "revenue",
          name: "Revenue",
          type: "sum",
          eventName: "purchase",
          valueField: "amount", // extract properties.amount
          direction: "increase",
        })
        .returning();
      const [exp] = await tx
        .insert(t.experiments)
        .values({
          organizationId: orgId,
          key: "checkout-rev",
          name: "Checkout revenue",
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
        metricType: "sum",
        eventName: "purchase",
        valueField: "amount",
        direction: "increase",
      });
    });

    // Enroll 10 control + 10 treatment units into the running experiment.
    await attributeExposures(orgId, envId, [
      ...Array.from({ length: 10 }, (_, i) => ({ key: "checkout", variant: "off", targetingKey: `c${i}` })),
      ...Array.from({ length: 10 }, (_, i) => ({ key: "checkout", variant: "on", targetingKey: `t${i}` })),
    ]);

    // Control: every unit purchases for $10 via PROPERTIES (no direct value).
    // Treatment: 9 units purchase $20 via properties; 1 unit uses the DIRECT value
    // path ($20, no properties) to prove fallback. Both arms average $10 vs $20.
    await recordMetricEvents(orgId, [
      ...Array.from({ length: 10 }, (_, i) => ({
        name: "purchase",
        targetingKey: `c${i}`,
        properties: { amount: 10, currency: "usd" },
      })),
      ...Array.from({ length: 9 }, (_, i) => ({
        name: "purchase",
        targetingKey: `t${i}`,
        properties: { amount: 20, currency: "usd" },
      })),
      { name: "purchase", targetingKey: "t9", value: 20 }, // fallback to direct value
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.experiments).where(eq(t.experiments.organizationId, orgId));
      await tx.delete(t.experimentMetrics).where(eq(t.experimentMetrics.organizationId, orgId));
      await tx.delete(t.experimentMetricEvents).where(eq(t.experimentMetricEvents.organizationId, orgId));
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
  });

  it("sums the value_field from event properties (with direct-value fallback)", async () => {
    const res = (await analyzeExperiment(orgId, experimentId))!;
    const metric = res.metrics.find((m) => m.metricKey === "revenue")!;
    // A sum metric analyzes per-unit totals as continuous.
    expect(metric.analysis.family).toBe("continuous");
    const control = metric.analysis.variants.find((v) => v.isControl)!;
    const treatment = metric.analysis.variants.find((v) => !v.isControl)!;
    // Per-unit mean: control $10, treatment $20 (incl. the direct-value fallback unit).
    expect(control.estimate).toBeCloseTo(10, 5);
    expect(treatment.estimate).toBeCloseTo(20, 5);
    expect(treatment.relativeLift!).toBeCloseTo(1.0, 5); // +100%
  });
});
