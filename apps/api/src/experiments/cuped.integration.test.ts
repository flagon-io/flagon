import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * CUPED end-to-end: prove the covariate SQL splits a unit's events into POST-exposure
 * (the response Y) and PRE-exposure (the covariate X), and that an experiment with
 * cuped=true reduces variance. Converters get a backdated pre-exposure event (plus a
 * few non-converters as noise), so pre-conversion X correlates with post-conversion Y
 * and CUPED removes a real chunk of variance.
 *
 * DB-gated (CI or local DATABASE_URL); seeds a throwaway org and cleans up.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("CUPED variance reduction (integration)", () => {
  let db: (typeof import("../db/client.js"))["db"];
  let t: typeof import("../db/schema.js");
  let authTables: typeof import("../db/auth-tables.js");
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let attributeExposures: (typeof import("./ingest.js"))["attributeExposures"];
  let recordMetricEvents: (typeof import("./ingest.js"))["recordMetricEvents"];
  let analyzeExperiment: (typeof import("./analyze.js"))["analyzeExperiment"];

  const orgId = randomUUID();
  const slug = `cuped-${orgId.slice(0, 8)}`;
  let envId: string;
  let experimentId: string;

  const CONTROL_UNITS = 400;
  const TREATMENT_UNITS = 400;
  const CONTROL_CONV = 40; // 10%
  const TREATMENT_CONV = 80; // 20%
  const TWO_DAYS_AGO = Date.now() - 2 * 24 * 60 * 60 * 1000;

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    authTables = await import("../db/auth-tables.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ attributeExposures, recordMetricEvents } = await import("./ingest.js"));
    ({ analyzeExperiment } = await import("./analyze.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "Cuped", slug, plan: "hobby" });

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
      const [on] = await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "on", value: true })
        .returning();
      const [off] = await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "off", value: false })
        .returning();
      await tx.insert(t.flagEnvironments).values({
        organizationId: orgId,
        flagId: flag.id,
        environmentId: envId,
        enabled: true,
        defaultVariantId: off.id,
        offVariantId: off.id,
      });
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
      const [exp] = await tx
        .insert(t.experiments)
        .values({
          organizationId: orgId,
          key: "color",
          name: "Color",
          flagId: flag.id,
          environmentId: envId,
          status: "running",
          controlVariantKey: "off",
          cuped: true,
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

    await attributeExposures(orgId, envId, [
      ...Array.from({ length: CONTROL_UNITS }, (_, i) => ({ key: "checkout", variant: "off", targetingKey: `c${i}` })),
      ...Array.from({ length: TREATMENT_UNITS }, (_, i) => ({ key: "checkout", variant: "on", targetingKey: `t${i}` })),
    ]);

    // POST-exposure conversions (the response Y): first N units of each arm convert.
    await recordMetricEvents(orgId, [
      ...Array.from({ length: CONTROL_CONV }, (_, i) => ({ name: "purchase", targetingKey: `c${i}` })),
      ...Array.from({ length: TREATMENT_CONV }, (_, i) => ({ name: "purchase", targetingKey: `t${i}` })),
    ]);

    // PRE-exposure history (the covariate X), backdated. The SAME 100 units in each
    // arm have a prior purchase, so X is BALANCED across arms (X must be independent
    // of assignment for CUPED to be unbiased). Every converter falls inside that
    // pre-purchaser set, so X correlates with Y WITHIN each arm (units 40..99 / 80..99
    // are pre-purchasers who did not convert — the noise that keeps ρ below 1).
    const pre: { name: string; targetingKey: string; timestamp: number }[] = [];
    for (let i = 0; i < 100; i++) pre.push({ name: "purchase", targetingKey: `c${i}`, timestamp: TWO_DAYS_AGO });
    for (let i = 0; i < 100; i++) pre.push({ name: "purchase", targetingKey: `t${i}`, timestamp: TWO_DAYS_AGO });
    await recordMetricEvents(orgId, pre);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.experimentMetricEvents).where(eq(t.experimentMetricEvents.organizationId, orgId));
      await tx.delete(t.experiments).where(eq(t.experiments.organizationId, orgId));
      await tx.delete(t.experimentMetrics).where(eq(t.experimentMetrics.organizationId, orgId));
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("applies CUPED from the pre-exposure covariate and removes variance", async () => {
    const res = (await analyzeExperiment(orgId, experimentId))!;
    expect(res.analysisConfig.cuped).toBe(true);

    const metric = res.metrics.find((m) => m.metricKey === "purchase")!;
    // CUPED routes any metric through the continuous analyzer on adjusted Y*.
    expect(metric.analysis.family).toBe("continuous");
    expect(metric.analysis.cuped?.applied).toBe(true);
    expect(metric.analysis.cuped!.varianceReduction).toBeGreaterThan(0);
    expect(metric.analysis.cuped!.varianceReduction).toBeLessThanOrEqual(1);

    // The +100% lift is still detected after adjustment.
    const treatment = metric.analysis.variants.find((v) => !v.isControl)!;
    expect(treatment.relativeLift!).toBeGreaterThan(0);
    expect(treatment.significant).toBe(true);
  });
});
