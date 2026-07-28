import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * End-to-end proof of the OFREP evaluation pipeline against the REAL tables:
 * seed a flag + variants + per-env config + an SDK key, then resolve the key and
 * evaluate exactly as the route does (resolveSdkKey -> withOrg -> load -> engine).
 *
 * Runs only where a migrated database is reachable (CI; or locally with
 * DATABASE_URL pointing at a migrated DB); skipped otherwise. Note: RLS
 * enforcement itself is proven separately (tenancy.audit + the psql SET ROLE
 * proof) because a superuser test connection bypasses RLS — here we prove the
 * projection and wiring are correct.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("OFREP pipeline (integration)", () => {
  // Imported lazily so the module's DB client isn't constructed when skipped.
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let loadEvaluationData: typeof import("./config.js")["loadEvaluationData"];
  let evaluate: typeof import("./evaluate.js")["evaluate"];
  let generateSdkKey: typeof import("./sdk-key.js")["generateSdkKey"];
  let resolveSdkKey: typeof import("./sdk-key.js")["resolveSdkKey"];

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
    ({ generateSdkKey, resolveSdkKey } = await import("./sdk-key.js"));

    const [env] = await db
      .insert(t.environments)
      .values({ organizationId: orgId, key: "production", name: "Production" })
      .returning();
    envId = env.id;

    const [flag] = await db
      .insert(t.flags)
      .values({ organizationId: orgId, key: "checkout", name: "Checkout", type: "boolean" })
      .returning();

    const [on] = await db
      .insert(t.flagVariants)
      .values({ organizationId: orgId, flagId: flag.id, key: "on", value: true })
      .returning();
    const [off] = await db
      .insert(t.flagVariants)
      .values({ organizationId: orgId, flagId: flag.id, key: "off", value: false })
      .returning();

    const [fe] = await db
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

    const gen = generateSdkKey();
    sdkToken = gen.token;
    await db.insert(t.sdkKeys).values({
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
    await db.delete(t.sdkKeys).where(eq(t.sdkKeys.organizationId, orgId));
    await db.delete(t.flags).where(eq(t.flags.organizationId, orgId));
    await db.delete(t.environments).where(eq(t.environments.organizationId, orgId));
  });

  const evalFlag = (context: Record<string, unknown>) =>
    withOrg(orgId, async (tx) => {
      const data = await loadEvaluationData(tx, envId, "checkout");
      const flag = data.flags.find((f) => f.key === "checkout");
      return flag ? evaluate(flag, context, data.segments) : null;
    });

  it("resolves an SDK key to its org + environment", async () => {
    const identity = await resolveSdkKey(sdkToken);
    expect(identity).toMatchObject({ organizationId: orgId, environmentId: envId });
  });

  it("rejects an unknown SDK key", async () => {
    expect(await resolveSdkKey("flagon_sdk_not_a_real_key")).toBeNull();
  });

  it("evaluates enabled -> on (true)", async () => {
    const r = await evalFlag({ targetingKey: "u1" });
    expect(r).toMatchObject({ value: true, variant: "on", reason: "STATIC" });
  });

  it("evaluates disabled -> off (false)", async () => {
    await db.update(t.flagEnvironments).set({ enabled: false }).where(eq(t.flagEnvironments.id, feId));
    const r = await evalFlag({ targetingKey: "u1" });
    expect(r).toMatchObject({ value: false, variant: "off", reason: "DISABLED" });
    await db.update(t.flagEnvironments).set({ enabled: true }).where(eq(t.flagEnvironments.id, feId));
  });

  it("applies a targeting rule stored in the DB", async () => {
    await db.insert(t.flagRules).values({
      organizationId: orgId,
      flagEnvironmentId: feId,
      priority: 0,
      conditions: [{ attribute: "plan", op: "eq", values: ["free"] }],
      serve: { variant: "off" },
    });
    const free = await evalFlag({ targetingKey: "u1", plan: "free" });
    expect(free).toMatchObject({ value: false, variant: "off", reason: "TARGETING_MATCH" });
    const pro = await evalFlag({ targetingKey: "u1", plan: "pro" });
    expect(pro?.value).toBe(true);
  });
});
