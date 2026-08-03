import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Full-loop integration over the REAL HTTP stack (in-process app.request, no port):
 * as an org token, create a metric + an experiment on a flag, start it, then as a
 * minted client key record exposures (with arm attribution) and goal events, and
 * finally read the computed results back. Exercises auth -> resolveOrg -> withOrg/
 * RLS -> experiment CRUD/lifecycle -> OFREP ingest -> attribution join -> the stats
 * engine, exactly as the console + an SDK would drive it end to end.
 *
 * Runs only with a migrated DB reachable (CI, or locally with DATABASE_URL). Writes
 * to a throwaway random org and cleans up; it never touches other orgs.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("experiments API + OFREP (integration, HTTP)", () => {
  let app: { request: (path: string, init?: RequestInit) => Promise<Response> };
  let db: typeof import("../../db/client.js")["db"];
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let authTables: typeof import("../../db/auth-tables.js");
  let schema: typeof import("../../db/schema.js");
  let hashToken: typeof import("../../lib/token-hash.js")["hashToken"];

  const orgId = randomUUID();
  const slug = `exp-${randomBytes(4).toString("hex")}`;
  const orgToken = `flagon_oat_${randomBytes(24).toString("base64url")}`;
  const auth = () => ({ Authorization: `Bearer ${orgToken}`, "Content-Type": "application/json" });
  const base = `/v1/orgs/${slug}`;

  const CONTROL_UNITS = 200;
  const TREATMENT_UNITS = 200;
  const CONTROL_CONV = 20; // 10%
  const TREATMENT_CONV = 40; // 20%
  let clientKey: string;

  beforeAll(async () => {
    app = (await import("../../index.js")).default as typeof app;
    ({ db } = await import("../../db/client.js"));
    ({ withOrg } = await import("../../db/tenant.js"));
    authTables = await import("../../db/auth-tables.js");
    schema = await import("../../db/schema.js");
    ({ hashToken } = await import("../../lib/token-hash.js"));

    await db
      .insert(authTables.organizations)
      .values({ id: orgId, name: "Exp Org", slug, plan: "pro" });
    await db.insert(authTables.accessTokens).values({
      id: randomUUID(),
      type: "organization",
      name: "test token",
      tokenHash: hashToken(orgToken),
      prefix: "flagon_oat",
      lastFour: orgToken.slice(-4),
      organizationId: orgId,
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(schema.experiments).where(eq(schema.experiments.organizationId, orgId));
      await tx.delete(schema.experimentMetrics).where(eq(schema.experimentMetrics.organizationId, orgId));
      await tx
        .delete(schema.experimentMetricEvents)
        .where(eq(schema.experimentMetricEvents.organizationId, orgId));
      await tx.delete(schema.flags).where(eq(schema.flags.organizationId, orgId));
      await tx.delete(schema.environments).where(eq(schema.environments.organizationId, orgId));
    });
    await db.delete(schema.clientKeys).where(eq(schema.clientKeys.organizationId, orgId));
    await db.delete(authTables.accessTokens).where(eq(authTables.accessTokens.organizationId, orgId));
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  const post = (path: string, body: unknown, headers = auth()) =>
    app.request(path, { method: "POST", headers, body: JSON.stringify(body) });

  it("seeds a flag, a metric, and a running experiment", async () => {
    // A boolean flag: its on/off variants are the arms.
    const flag = await post(`${base}/flags`, { slug: "checkout", type: "boolean" });
    expect(flag.status).toBe(201);

    const metric = await post(`${base}/experiment-metrics`, {
      key: "purchase",
      name: "Purchase",
      type: "conversion",
      eventName: "purchase",
      direction: "increase",
    });
    expect(metric.status).toBe(201);

    const exp = await post(`${base}/experiments`, {
      key: "checkout-exp",
      name: "Checkout experiment",
      flag: "checkout",
      environment: "production",
      controlVariantKey: "off",
      metrics: [{ key: "purchase", role: "primary" }],
    });
    expect(exp.status).toBe(201);
    const created = await exp.json();
    expect(created.experiment).toMatchObject({
      flag: "checkout",
      environment: "production",
      controlVariantKey: "off",
      primaryMetric: "purchase",
      status: "draft",
    });

    const started = await post(`${base}/experiments/checkout-exp/start`, {});
    expect(started.status).toBe(200);
    expect((await started.json()).experiment.status).toBe("running");

    // A validation error: creating on a nonexistent flag is a 422.
    const bad = await post(`${base}/experiments`, {
      key: "nope",
      name: "Nope",
      flag: "ghost-flag",
      environment: "production",
    });
    expect(bad.status).toBe(422);
  });

  it("records attributed exposures and goal events over OFREP", async () => {
    const keyRes = await post(`${base}/client-keys`, { name: "prod", environment: "production" });
    expect(keyRes.status).toBe(201);
    clientKey = (await keyRes.json()).key.token;
    const sdk = { Authorization: `Bearer ${clientKey}`, "Content-Type": "application/json" };

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
    const expo = await post(`/ofrep/v1/exposures`, { events: exposures }, sdk);
    expect(expo.status).toBe(202);

    const events = [
      ...Array.from({ length: CONTROL_CONV }, (_, i) => ({ metric: "purchase", targetingKey: `c${i}` })),
      ...Array.from({ length: TREATMENT_CONV }, (_, i) => ({ metric: "purchase", targetingKey: `t${i}` })),
    ];
    const track = await post(`/ofrep/v1/track`, { events }, sdk);
    expect(track.status).toBe(202);
    expect(await track.json()).toMatchObject({ recorded: CONTROL_CONV + TREATMENT_CONV });
  });

  it("exposes the diagnostics streams (arms, recent exposures + events)", async () => {
    const res = await app.request(`${base}/experiments/checkout-exp/diagnostics`, { headers: auth() });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.totals.exposures).toBe(CONTROL_UNITS + TREATMENT_UNITS);
    expect(d.totals.events).toBe(CONTROL_CONV + TREATMENT_CONV);
    expect(d.arms.map((a: { variant: string }) => a.variant).sort()).toEqual(["off", "on"]);
    expect(d.recentExposures.length).toBeGreaterThan(0);
    expect(d.recentExposures[0]).toHaveProperty("unit");
    expect(d.recentExposures[0]).toHaveProperty("variant");
    expect(d.recentEvents.length).toBeGreaterThan(0);
  });

  it("computes a correct, significant readout through the results endpoint", async () => {
    const res = await app.request(`${base}/experiments/checkout-exp/results`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.totalUnits).toBe(CONTROL_UNITS + TREATMENT_UNITS);
    const primary = body.metrics.find((m: { role: string }) => m.role === "primary");
    expect(primary.metricKey).toBe("purchase");

    const control = primary.analysis.variants.find((v: { isControl: boolean }) => v.isControl);
    const treatment = primary.analysis.variants.find((v: { isControl: boolean }) => !v.isControl);

    expect(control.estimate).toBeCloseTo(0.1, 5);
    expect(control.units).toBe(CONTROL_UNITS);
    expect(treatment.estimate).toBeCloseTo(0.2, 5);
    expect(treatment.relativeLift).toBeCloseTo(1.0, 5);
    expect(treatment.pValue).toBeLessThan(0.01);
    expect(treatment.significant).toBe(true);
    expect(treatment.probabilityToBeatControl).toBeGreaterThan(0.99);
    expect(primary.analysis.srm.healthy).toBe(true);
  });

  it("records a decision and reflects it", async () => {
    const decide = await post(`${base}/experiments/checkout-exp/decide`, { decision: "ship" });
    expect(decide.status).toBe(200);
    const body = await decide.json();
    expect(body.experiment.decision).toBe("ship");
    expect(body.experiment.status).toBe("stopped");
  });

  it("refuses an org the token is not authorized for", async () => {
    const res = await app.request(`/v1/orgs/not-my-org/experiments`, { headers: auth() });
    expect(res.status).toBe(404);
  });
});
