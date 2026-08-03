import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Always-on flag impact WITHOUT an experiment: attribute exposures to a flag, watch
 * a metric on it, and prove analyzeFlag() computes correct per-variant impact
 * (control = the environment's default variant). Also proves the plan-gated
 * retention window excludes old data and a paid override widens it.
 *
 * DB-gated (CI or local DATABASE_URL); seeds a throwaway org and cleans up.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("flag impact + retention (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let authTables: typeof import("../db/auth-tables.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let hashUnit: typeof import("../lib/unit-hash.js")["hashUnit"];
  let attributeExposures: typeof import("./ingest.js")["attributeExposures"];
  let recordMetricEvents: typeof import("./ingest.js")["recordMetricEvents"];
  let analyzeFlag: typeof import("./analyze.js")["analyzeFlag"];

  const orgId = randomUUID();
  const slug = `impact-${orgId.slice(0, 8)}`;
  let envId: string;
  let flagId: string;
  let offId: string;

  const CONTROL_UNITS = 200;
  const TREATMENT_UNITS = 200;

  const dayAgo = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d;
  };

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    authTables = await import("../db/auth-tables.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ hashUnit } = await import("../lib/unit-hash.js"));
    ({ attributeExposures, recordMetricEvents } = await import("./ingest.js"));
    ({ analyzeFlag } = await import("./analyze.js"));

    // A real org row so retention resolves (Hobby → 7d) and the override is testable.
    await db.insert(authTables.organizations).values({ id: orgId, name: "Impact", slug, plan: "hobby" });

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

      const [on] = await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "on", value: true })
        .returning();
      const [off] = await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "off", value: false })
        .returning();
      offId = off.id;

      // The env's default variant = off → the implicit control for flag impact.
      await tx.insert(t.flagEnvironments).values({
        organizationId: orgId,
        flagId: flag.id,
        environmentId: envId,
        enabled: true,
        defaultVariantId: off.id,
        offVariantId: off.id,
      });

      // Define a metric and WATCH it on the flag — no experiment.
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
      await tx.insert(t.flagMetricLinks).values({
        organizationId: orgId,
        flagId: flag.id,
        metricId: metric.id,
      });
    });

    // Attribute exposures (no experiment anywhere) + record goal events.
    await attributeExposures(orgId, envId, [
      ...Array.from({ length: CONTROL_UNITS }, (_, i) => ({ key: "checkout", variant: "off", targetingKey: `c${i}` })),
      ...Array.from({ length: TREATMENT_UNITS }, (_, i) => ({ key: "checkout", variant: "on", targetingKey: `t${i}` })),
    ]);
    await recordMetricEvents(orgId, [
      ...Array.from({ length: 20 }, (_, i) => ({ name: "purchase", targetingKey: `c${i}` })),
      ...Array.from({ length: 40 }, (_, i) => ({ name: "purchase", targetingKey: `t${i}` })),
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.experimentMetricEvents).where(eq(t.experimentMetricEvents.organizationId, orgId));
      await tx.delete(t.experimentMetrics).where(eq(t.experimentMetrics.organizationId, orgId));
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId)); // cascades flag_exposures + links
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("computes per-variant impact with the default variant as control — no experiment", async () => {
    const res = (await analyzeFlag(orgId, "checkout", "production"))!;
    expect(res.controlVariantKey).toBe("off");
    expect(res.totalUnits).toBe(CONTROL_UNITS + TREATMENT_UNITS);

    const metric = res.metrics.find((m) => m.metricKey === "purchase")!;
    const control = metric.analysis.variants.find((v) => v.isControl)!;
    const treatment = metric.analysis.variants.find((v) => !v.isControl)!;
    expect(control.estimate).toBeCloseTo(0.1, 5);
    expect(treatment.estimate).toBeCloseTo(0.2, 5);
    expect(treatment.relativeLift!).toBeCloseTo(1.0, 5);
    expect(treatment.significant).toBe(true);
    expect(treatment.probabilityToBeatControl!).toBeGreaterThan(0.99);
  });

  it("excludes data older than the plan window, and a retention override reveals it", async () => {
    // A converted control unit from 10 days ago — outside Hobby's 7-day window.
    const oldHash = hashUnit("old-c");
    await withOrg(orgId, async (tx) => {
      await tx.insert(t.flagExposures).values({
        organizationId: orgId,
        flagId,
        environmentId: envId,
        variantKey: "off",
        unitHash: oldHash,
        firstSeenAt: dayAgo(10),
        day: dayAgo(10).toISOString().slice(0, 10),
      });
      await tx.insert(t.experimentMetricEvents).values({
        organizationId: orgId,
        unitHash: oldHash,
        eventName: "purchase",
        value: 1,
        occurredAt: dayAgo(10),
        day: dayAgo(10).toISOString().slice(0, 10),
      });
    });

    // Hobby (7d): the 10-day-old unit is excluded — control stays at 200.
    const hobby = (await analyzeFlag(orgId, "checkout", "production"))!;
    expect(hobby.retentionDays).toBe(7);
    expect(hobby.metrics[0]!.analysis.variants.find((v) => v.isControl)!.units).toBe(CONTROL_UNITS);

    // Buy more history (override 30d): the old unit now counts — control becomes 201.
    await db
      .update(authTables.organizations)
      .set({ metadata: JSON.stringify({ retentionDays: 30 }) })
      .where(eq(authTables.organizations.id, orgId));
    const widened = (await analyzeFlag(orgId, "checkout", "production"))!;
    expect(widened.retentionDays).toBe(30);
    expect(widened.metrics[0]!.analysis.variants.find((v) => v.isControl)!.units).toBe(CONTROL_UNITS + 1);
  });
});
