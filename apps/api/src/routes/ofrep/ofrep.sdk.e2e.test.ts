import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { OpenFeature, type Client } from "@openfeature/server-sdk";
import { OFREPProvider } from "@openfeature/ofrep-provider";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * PROOF A REAL CUSTOMER WORKS: this drives our OFREP endpoints through the ACTUAL
 * OpenFeature server SDK + the official OFREP provider, over real HTTP against the
 * mounted app on an ephemeral port. If an OpenFeature user points their client at
 * Flagon with a client key, this is exactly what happens. No hand-rolled requests.
 *
 * DB-gated; seeded through withOrg like the other integration tests.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("OFREP via the OpenFeature SDK (e2e)", () => {
  let db: typeof import("../../db/client.js")["db"];
  let t: typeof import("../../db/schema.js");
  let withOrg: typeof import("../../db/tenant.js")["withOrg"];
  let generateClientKey: typeof import("../../flags/client-key.js")["generateClientKey"];

  const orgId = randomUUID();
  let envId: string;
  let token: string;
  let server: Server;
  let client: Client;

  beforeAll(async () => {
    ({ db } = await import("../../db/client.js"));
    t = await import("../../db/schema.js");
    ({ withOrg } = await import("../../db/tenant.js"));
    ({ generateClientKey } = await import("../../flags/client-key.js"));
    const { ofrep } = await import("./index.js");

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
      await tx.insert(t.flagRules).values({
        organizationId: orgId,
        flagEnvironmentId: fe.id,
        priority: 0,
        conditions: [{ attribute: "plan", op: "eq", values: ["free"] }],
        serve: { variant: "off" },
      });
    });

    const gen = generateClientKey();
    token = gen.token;
    await db.insert(t.clientKeys).values({
      organizationId: orgId,
      environmentId: envId,
      name: "e2e key",
      keyHash: gen.keyHash,
      prefix: gen.prefix,
      lastFour: gen.lastFour,
    });

    // Serve the app on an ephemeral port, then point the real OFREP provider at it.
    const app = new Hono();
    app.route("/ofrep", ofrep);
    const port = await new Promise<number>((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => resolve(info.port));
    });

    await OpenFeature.setProviderAndWait(
      new OFREPProvider({
        baseUrl: `http://localhost:${port}`,
        headers: [["Authorization", `Bearer ${token}`]],
      }),
    );
    client = OpenFeature.getClient();
  });

  afterAll(async () => {
    await OpenFeature.close();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (!db) return;
    await db.delete(t.clientKeys).where(eq(t.clientKeys.organizationId, orgId));
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId));
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
      await tx.delete(t.flagEvalRollups).where(eq(t.flagEvalRollups.organizationId, orgId));
    });
  });

  it("resolves a boolean flag through the OpenFeature client", async () => {
    expect(await client.getBooleanValue("checkout", false, { targetingKey: "u1" })).toBe(true);
  });

  it("applies targeting rules through the SDK", async () => {
    expect(
      await client.getBooleanValue("checkout", true, { targetingKey: "u1", plan: "free" }),
    ).toBe(false);
  });

  it("exposes variant + reason via evaluation details", async () => {
    const d = await client.getBooleanDetails("checkout", false, { targetingKey: "u1" });
    expect(d.value).toBe(true);
    expect(d.variant).toBe("on");
    expect(d.reason).toBe("DEFAULT");
  });

  it("returns the caller's default when a flag doesn't exist (graceful)", async () => {
    const d = await client.getBooleanDetails("does-not-exist", false, { targetingKey: "u1" });
    expect(d.value).toBe(false);
    expect(d.errorCode).toBe("FLAG_NOT_FOUND");
  });
});
