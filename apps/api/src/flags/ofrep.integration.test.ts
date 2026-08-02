import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * End-to-end proof of the OFREP evaluation pipeline against the REAL tables:
 * seed a flag + variants + per-env config + an client key, then resolve the key and
 * evaluate exactly as the route does (resolveClientKey -> withOrg -> load -> engine).
 *
 * Runs only where a migrated database is reachable (CI; or locally with
 * DATABASE_URL/APP_DATABASE_URL pointing at a migrated DB); skipped otherwise.
 * Fixtures seed through withOrg(), so this passes whether the connection ENFORCES
 * RLS (the restricted role CI now runs as) or bypasses it (a superuser).
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("OFREP pipeline (integration)", () => {
  // Imported lazily so the module's DB client isn't constructed when skipped.
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let loadEvaluationData: typeof import("./config.js")["loadEvaluationData"];
  let evaluate: typeof import("./evaluate.js")["evaluate"];
  let generateClientKey: typeof import("./client-key.js")["generateClientKey"];
  let resolveClientKey: typeof import("./client-key.js")["resolveClientKey"];

  const orgId = randomUUID();
  let envId: string;
  let feId: string;
  let sdkToken: string;

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ loadEvaluationData } = await import("./config.js"));
    ({ evaluate } = await import("./evaluate.js"));
    ({ generateClientKey, resolveClientKey } = await import("./client-key.js"));

    // Seed the RLS-protected tables INSIDE withOrg so this passes whether the
    // test connection enforces RLS (the restricted role, as in CI) or bypasses
    // it (a superuser). This also mirrors how the app always writes.
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
      feId = fe.id;
    });

    // client_keys is an auth-layer table with NO RLS (it is resolved before any org
    // context exists), so it is written on the bare client, exactly as minting does.
    const gen = generateClientKey();
    sdkToken = gen.token;
    await db.insert(t.clientKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "test key",
      keyHash: gen.keyHash,
      prefix: gen.prefix,
      lastFour: gen.lastFour,
    });
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(t.clientKeys).where(eq(t.clientKeys.organizationId, orgId));
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
  });

  const evalFlag = (context: Record<string, unknown>) =>
    withOrg(orgId, async (tx) => {
      const data = await loadEvaluationData(tx, envId, "checkout");
      const flag = data.flags.find((f) => f.key === "checkout");
      return flag ? evaluate(flag, context, data.segments) : null;
    });

  it("resolves an client key to its org + environment", async () => {
    const identity = await resolveClientKey(sdkToken);
    expect(identity).toMatchObject({ organizationId: orgId, environmentId: envId });
  });

  it("rejects an unknown client key", async () => {
    expect(await resolveClientKey("flagon_sdk_not_a_real_key")).toBeNull();
  });

  it("evaluates enabled -> on (true)", async () => {
    const r = await evalFlag({ targetingKey: "u1" });
    expect(r).toMatchObject({ value: true, variant: "on", reason: "STATIC" });
  });

  it("evaluates disabled -> off (false)", async () => {
    await withOrg(orgId, (tx) =>
      tx.update(t.flagEnvironments).set({ enabled: false }).where(eq(t.flagEnvironments.id, feId)),
    );
    const r = await evalFlag({ targetingKey: "u1" });
    expect(r).toMatchObject({ value: false, variant: "off", reason: "DISABLED" });
    await withOrg(orgId, (tx) =>
      tx.update(t.flagEnvironments).set({ enabled: true }).where(eq(t.flagEnvironments.id, feId)),
    );
  });

  it("applies a targeting rule stored in the DB", async () => {
    await withOrg(orgId, (tx) =>
      tx.insert(t.flagRules).values({
        organizationId: orgId,
        flagEnvironmentId: feId,
        priority: 0,
        conditions: [{ attribute: "plan", op: "eq", values: ["free"] }],
        serve: { variant: "off" },
      }),
    );
    const free = await evalFlag({ targetingKey: "u1", plan: "free" });
    expect(free).toMatchObject({ value: false, variant: "off", reason: "TARGETING_MATCH" });
    const pro = await evalFlag({ targetingKey: "u1", plan: "pro" });
    expect(pro?.value).toBe(true);
  });
});
