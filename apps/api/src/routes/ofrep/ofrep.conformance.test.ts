import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * OFREP CONFORMANCE — the real HTTP contract SDKs depend on.
 *
 * Unlike ofrep.integration.test.ts (which drives the eval pipeline directly), this
 * mounts the actual `/ofrep` routes and makes HTTP requests, asserting the exact
 * OFREP shapes and status codes an OpenFeature OFREP provider expects: single +
 * bulk evaluation, the success/failure envelopes, auth, FLAG_NOT_FOUND,
 * PARSE_ERROR / INVALID_CONTEXT, bulk ETag/304, and exposure ingest. This is the
 * "will flags work for real customers" gate.
 *
 * DB-gated (CI or a local migrated DB); seeded through withOrg like the other
 * integration tests, so it passes whether the connection enforces RLS or not.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("OFREP conformance (HTTP)", () => {
  let db: typeof import("../../db/client.js")["db"];
  let t: typeof import("../../db/schema.js");
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let generateSdkKey: typeof import("../../flags/sdk-key.js")["generateSdkKey"];
  let app: Hono;

  const orgId = randomUUID();
  let envId: string;
  let token: string;

  // Small helper: make an OFREP request with the SDK key and JSON body.
  const req = (path: string, init: RequestInit = {}, auth = true) =>
    app.request(path, {
      method: "POST",
      ...init,
      headers: {
        "content-type": "application/json",
        ...(auth ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });

  beforeAll(async () => {
    ({ db } = await import("../../db/client.js"));
    t = await import("../../db/schema.js");
    ({ withOrg } = await import("../../db/tenant.js"));
    ({ generateSdkKey } = await import("../../flags/sdk-key.js"));
    const { ofrep } = await import("./index.js");
    app = new Hono();
    app.route("/ofrep", ofrep);

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
      const [fe] = await tx
        .insert(t.flagEnvironments)
        .values({
          organizationId: orgId,
          flagId: flag.id,
          environmentId: envId,
          enabled: true,
          defaultVariantId: on.id,
          offVariantId: off.id,
        })
        .returning();
      // A targeting rule: free plan gets off.
      await tx.insert(t.flagRules).values({
        organizationId: orgId,
        flagEnvironmentId: fe.id,
        priority: 0,
        conditions: [{ attribute: "plan", op: "eq", values: ["free"] }],
        serve: { variant: "off" },
      });
    });

    const gen = generateSdkKey();
    token = gen.token;
    await db.insert(t.sdkKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "conformance key",
      keyHash: gen.keyHash,
      prefix: gen.prefix,
      lastFour: gen.lastFour,
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(t.sdkKeys).where(eq(t.sdkKeys.organizationId, orgId));
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
      await tx.delete(t.flagEvalRollups).where(eq(t.flagEvalRollups.organizationId, orgId));
      await tx.delete(t.usageEvents).where(eq(t.usageEvents.organizationId, orgId));
      await tx.delete(t.usageEventRollups).where(eq(t.usageEventRollups.organizationId, orgId));
      await tx.delete(t.usageCounters).where(eq(t.usageCounters.organizationId, orgId));
    });
  });

  // --- Auth ------------------------------------------------------------------
  it("401s without a client key", async () => {
    const res = await req("/ofrep/v1/evaluate/flags/checkout", { body: "{}" }, false);
    expect(res.status).toBe(401);
    expect((await res.json()).errorCode).toBe("AUTHENTICATION_ERROR");
  });

  it("401s with an unknown client key", async () => {
    const res = await app.request("/ofrep/v1/evaluate/flags/checkout", {
      method: "POST",
      headers: { authorization: "Bearer flagon_client_nope", "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(401);
  });

  // --- Single evaluation -----------------------------------------------------
  it("evaluates a single flag into the OFREP success shape", async () => {
    const res = await req("/ofrep/v1/evaluate/flags/checkout", {
      body: JSON.stringify({ context: { targetingKey: "u1" } }),
    });
    expect(res.status).toBe(200);
    // The flag has a targeting rule, so a non-matching eval is DEFAULT (STATIC is
    // reserved for a flag with no targeting at all).
    expect(await res.json()).toEqual({
      key: "checkout",
      value: true,
      variant: "on",
      reason: "DEFAULT",
      metadata: {},
    });
  });

  it("applies a targeting rule (TARGETING_MATCH)", async () => {
    const res = await req("/ofrep/v1/evaluate/flags/checkout", {
      body: JSON.stringify({ context: { targetingKey: "u1", plan: "free" } }),
    });
    const body = await res.json();
    expect(body).toMatchObject({ value: false, variant: "off", reason: "TARGETING_MATCH" });
  });

  it("404s FLAG_NOT_FOUND for an unknown flag", async () => {
    const res = await req("/ofrep/v1/evaluate/flags/nope", { body: "{}" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ key: "nope", errorCode: "FLAG_NOT_FOUND" });
  });

  it("400s PARSE_ERROR on a malformed body", async () => {
    const res = await req("/ofrep/v1/evaluate/flags/checkout", { body: "{not json" });
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("PARSE_ERROR");
  });

  it("400s INVALID_CONTEXT when context is not an object", async () => {
    const res = await req("/ofrep/v1/evaluate/flags/checkout", {
      body: JSON.stringify({ context: "nope" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).errorCode).toBe("INVALID_CONTEXT");
  });

  // --- Bulk evaluation + ETag ------------------------------------------------
  it("bulk-evaluates into { flags: [...] }", async () => {
    const res = await req("/ofrep/v1/evaluate/flags", {
      body: JSON.stringify({ context: { targetingKey: "u1" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.flags)).toBe(true);
    expect(body.flags).toContainEqual({
      key: "checkout",
      value: true,
      variant: "on",
      reason: "DEFAULT",
      metadata: {},
    });
  });

  it("returns an ETag and 304s a matching If-None-Match", async () => {
    const first = await req("/ofrep/v1/evaluate/flags", {
      body: JSON.stringify({ context: { targetingKey: "u1" } }),
    });
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    const second = await req("/ofrep/v1/evaluate/flags", {
      body: JSON.stringify({ context: { targetingKey: "u1" } }),
      headers: { "if-none-match": etag! },
    });
    expect(second.status).toBe(304);
  });

  // --- Exposures -------------------------------------------------------------
  it("records exposures (202) and dedupes by Idempotency-Key", async () => {
    const body = JSON.stringify({ events: [{ key: "checkout" }, { key: "checkout" }] });
    const headers = { "idempotency-key": "conf-batch-1" };
    const first = await req("/ofrep/v1/exposures", { body, headers });
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ recorded: 2, duplicate: false });
    const retry = await req("/ofrep/v1/exposures", { body, headers });
    expect(await retry.json()).toEqual({ recorded: 0, duplicate: true });
  });

  it("hard-caps: refuses exposures once a Hobby org is over its allowance", async () => {
    // This org has no organizations row, so its plan defaults to Hobby (2M cap,
    // hardCap on). Push the current period's counter past the cap, then a fresh
    // exposure batch must be refused with 403 PLAN_LIMIT_REACHED. Evaluation is a
    // separate path and stays available (covered by the tests above).
    const period = new Date().toISOString().slice(0, 7);
    await withOrg(orgId, (tx) =>
      tx
        .insert(t.usageCounters)
        .values({ organizationId: orgId, period, count: 2_500_000 })
        .onConflictDoUpdate({
          target: [t.usageCounters.organizationId, t.usageCounters.period],
          set: { count: 2_500_000 },
        }),
    );

    const res = await req("/ofrep/v1/exposures", {
      body: JSON.stringify({ events: [{ key: "checkout" }] }),
      headers: { "idempotency-key": "conf-over-cap" },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).errorCode).toBe("PLAN_LIMIT_REACHED");

    // Clean the counter so it doesn't bleed into other assertions.
    await withOrg(orgId, (tx) =>
      tx.delete(t.usageCounters).where(eq(t.usageCounters.organizationId, orgId)),
    );
  });
});
