import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";

/**
 * Exposures default-on, end to end against the DB: calling maybeAutoExpose bills
 * exactly one `flags.exposure` receipt for a served evaluation, dedups a repeat in
 * the same session, respects the per-key / per-request / no-unit guards, and NEVER
 * bills once a hard-capped plan is over its allowance. Calling the function directly
 * (rather than through HTTP) keeps the billing assertions deterministic — the real
 * handler fires it deferred/fire-and-forget.
 *
 * DB-gated; seeds a throwaway org and cleans up.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.APP_DATABASE_URL;

describe.skipIf(!DATABASE_URL)("auto-expose default-on (integration)", () => {
  let db: (typeof import("../db/client.js"))["db"];
  let t: typeof import("../db/schema.js");
  let authTables: typeof import("../db/auth-tables.js");
  let withOrg: (typeof import("../db/tenant.js"))["withOrg"];
  let maybeAutoExpose: (typeof import("./auto-expose.js"))["maybeAutoExpose"];
  let reset: (typeof import("./auto-expose.js"))["__resetAutoExposeState"];

  const orgId = randomUUID();
  const slug = `autoexp-${orgId.slice(0, 8)}`;
  let envId: string;
  let flagId: string;

  const flagConfig = () => ({
    id: flagId,
    key: "checkout",
    type: "boolean" as const,
    variants: [
      { id: "1", key: "on", value: true },
      { id: "2", key: "off", value: false },
    ],
    enabled: true,
    defaultVariantKey: "on" as string | null,
    defaultServe: null,
    offVariantKey: "off" as string | null,
    rules: [],
  });
  const served = (variant: string) => ({
    key: "checkout",
    value: true,
    variant,
    reason: "SPLIT" as const,
  });
  const identity = (over: Record<string, unknown> = {}) => ({
    keyId: "k",
    organizationId: orgId,
    environmentId: envId,
    plan: "hobby",
    autoExpose: true,
    ...over,
  });

  async function exposureCount(): Promise<number> {
    const rows = await withOrg(orgId, (tx) =>
      tx
        .select({ n: sql<number>`count(*)::int` })
        .from(t.usageEvents)
        .where(and(eq(t.usageEvents.organizationId, orgId), eq(t.usageEvents.source, "flags.exposure"))),
    );
    return Number(rows[0]?.n ?? 0);
  }

  beforeAll(async () => {
    ({ db } = await import("../db/client.js"));
    t = await import("../db/schema.js");
    authTables = await import("../db/auth-tables.js");
    ({ withOrg } = await import("../db/tenant.js"));
    ({ maybeAutoExpose, __resetAutoExposeState: reset } = await import("./auto-expose.js"));

    await db.insert(authTables.organizations).values({ id: orgId, name: "AutoExp", slug, plan: "hobby" });
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
      await tx
        .insert(t.flagVariants)
        .values({ organizationId: orgId, flagId: flag.id, key: "off", value: false });
      await tx.insert(t.flagEnvironments).values({
        organizationId: orgId,
        flagId: flag.id,
        environmentId: envId,
        enabled: true,
        defaultVariantId: on.id,
        offVariantId: on.id,
      });
    });
  });

  beforeEach(() => reset()); // clear the dedup + cap caches between cases

  afterAll(async () => {
    if (!db) return;
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.usageEvents).where(eq(t.usageEvents.organizationId, orgId));
      await tx.delete(t.usageCounters).where(eq(t.usageCounters.organizationId, orgId));
      await tx.delete(t.flags).where(eq(t.flags.organizationId, orgId)); // cascades exposures
      await tx.delete(t.environments).where(eq(t.environments.organizationId, orgId));
    });
    await db.delete(authTables.organizations).where(eq(authTables.organizations.id, orgId));
  });

  it("bills one exposure for a served eval and dedups a repeat in the session", async () => {
    const before = await exposureCount();
    await maybeAutoExpose(identity(), flagConfig(), served("on"), { targetingKey: "u1" }, false);
    expect(await exposureCount()).toBe(before + 1);
    // Same unit + variant again within the window → deduped, no new receipt.
    await maybeAutoExpose(identity(), flagConfig(), served("on"), { targetingKey: "u1" }, false);
    expect(await exposureCount()).toBe(before + 1);
  });

  it("bills a distinct unit and a distinct variant separately", async () => {
    const before = await exposureCount();
    await maybeAutoExpose(identity(), flagConfig(), served("on"), { targetingKey: "u2" }, false);
    await maybeAutoExpose(identity(), flagConfig(), served("off"), { targetingKey: "u2" }, false);
    await maybeAutoExpose(identity(), flagConfig(), served("on"), { targetingKey: "u3" }, false);
    expect(await exposureCount()).toBe(before + 3);
  });

  it("does not bill when opted out, when the key is off, or with no unit", async () => {
    const before = await exposureCount();
    await maybeAutoExpose(identity(), flagConfig(), served("on"), { targetingKey: "u4" }, true); // header off
    await maybeAutoExpose(identity({ autoExpose: false }), flagConfig(), served("on"), { targetingKey: "u5" }, false);
    await maybeAutoExpose(identity(), flagConfig(), served("on"), {}, false); // no targetingKey
    expect(await exposureCount()).toBe(before);
  });

  it("serves-but-does-not-bill once a hard-capped plan is over its allowance", async () => {
    // Drive this org over Hobby's included allowance for the current period.
    const period = new Date().toISOString().slice(0, 7);
    await withOrg(orgId, async (tx) => {
      await tx.delete(t.usageCounters).where(eq(t.usageCounters.period, period));
      await tx.insert(t.usageCounters).values({ organizationId: orgId, period, count: 100_000_000 });
    });
    reset(); // drop the cached (uncapped) status so it re-reads
    const before = await exposureCount();
    await maybeAutoExpose(identity(), flagConfig(), served("on"), { targetingKey: "capped-1" }, false);
    expect(await exposureCount()).toBe(before);
  });
});
