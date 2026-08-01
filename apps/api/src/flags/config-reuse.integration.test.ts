import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The "Reuse" evaluation mode: a (flag, environment) with reuse_source_environment_id
 * set inherits the SOURCE environment's config (rules + default) for that flag,
 * resolved in loadEvaluationData so the engine is unaffected. Also proves the
 * null-safe default: a flag with no reuse source is unchanged.
 *
 * DB-gated (CI or local migrated DB), seeded through withOrg() like the OFREP
 * integration test.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("config reuse (integration)", () => {
  let db: typeof import("../db/client.js")["db"];
  let t: typeof import("../db/schema.js");
  let withOrg: typeof import("../db/tenant.js")["withOrg"];
  let loadEvaluationData: typeof import("./config.js")["loadEvaluationData"];

  const orgId = randomUUID();
  let prodEnvId: string;
  let devEnvId: string;

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ loadEvaluationData } = await import("./config.js"));

    await withOrg(orgId, async (tx) => {
      const [prod] = await tx
        .insert(t.environments)
        .values({ organizationId: orgId, key: "production", name: "Production" })
        .returning();
      const [dev] = await tx
        .insert(t.environments)
        .values({ organizationId: orgId, key: "development", name: "Development" })
        .returning();
      prodEnvId = prod.id;
      devEnvId = dev.id;

      const [flag] = await tx
        .insert(t.flags)
        .values({ organizationId: orgId, key: "reused", name: "Reused", type: "boolean" })
        .returning();
      const [on] = await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "on", value: true })
        .returning();
      const [off] = await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "off", value: false })
        .returning();

      // Development (the SOURCE) has a targeting rule + default on.
      const [devFe] = await tx
        .insert(t.flagEnvironments)
        .values({
          organizationId: orgId,
          flagId: flag.id,
          environmentId: devEnvId,
          enabled: true,
          defaultVariantId: on.id,
          offVariantId: off.id,
        })
        .returning();
      await tx.insert(t.flagRules).values({
        organizationId: orgId,
        flagEnvironmentId: devFe.id,
        priority: 0,
        conditions: [{ attribute: "plan", op: "eq", values: ["pro"] }],
        serve: { variant: "on" },
      });

      // Production has its OWN (bare) config, but REUSES development.
      await tx.insert(t.flagEnvironments).values({
        organizationId: orgId,
        flagId: flag.id,
        environmentId: prodEnvId,
        enabled: false,
        offVariantId: off.id,
        reuseSourceEnvironmentId: devEnvId,
      });
    });
  });

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
  });

  it("production inherits development's rules and default via reuse", async () => {
    const data = await withOrg(orgId, (tx) => loadEvaluationData(tx, prodEnvId, "reused"));
    const flag = data.flags.find((f) => f.key === "reused");
    expect(flag).toBeTruthy();
    // Development's config, not production's own bare one.
    expect(flag!.enabled).toBe(true);
    expect(flag!.defaultVariantKey).toBe("on");
    expect(flag!.rules).toHaveLength(1);
    expect(flag!.rules[0]!.conditions).toEqual([
      { attribute: "plan", op: "eq", values: ["pro"] },
    ]);
  });

  it("development (the source, no reuse) is unchanged", async () => {
    const data = await withOrg(orgId, (tx) => loadEvaluationData(tx, devEnvId, "reused"));
    const flag = data.flags.find((f) => f.key === "reused");
    expect(flag!.enabled).toBe(true);
    expect(flag!.rules).toHaveLength(1);
  });
});
