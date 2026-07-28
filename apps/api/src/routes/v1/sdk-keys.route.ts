import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { withOrg } from "../../db/tenant.js";
import { environments, sdkKeys } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg } from "../../lib/org-context.js";
import { ensureEnvironments } from "../../flags/environments.js";
import { generateSdkKey } from "../../flags/sdk-key.js";

/**
 * SDK-key management. Mounted under /v1/orgs/:org/sdk-keys.
 *
 * sdk_keys is an auth-layer table (see the migration): the eval path must
 * resolve a key to its org BEFORE any org context exists, so it can't be
 * RLS-gated. Management here therefore scopes by organization_id in the query
 * (app layer), exactly as the console does for access tokens. The environment a
 * key belongs to IS validated through withOrg(), so a key can only ever point at
 * one of the caller's own environments. The plaintext key is returned ONCE, at
 * creation; only its hash is stored.
 */
export const sdkKeys_ = new Hono();

sdkKeys_.use("*", authContext);

const createKey = z.object({
  name: z.string().trim().min(1).max(120),
  environment: z.string().min(1),
});

function serializeKey(
  k: typeof sdkKeys.$inferSelect,
  environmentKey: string | null,
) {
  return {
    id: k.id,
    name: k.name,
    environmentKey,
    prefix: k.prefix,
    lastFour: k.lastFour,
    masked: `${k.prefix}_••••${k.lastFour}`,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

// --- Create ------------------------------------------------------------------
sdkKeys_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const parsed = createKey.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  // Seed the fixed environments if this org has never touched flags, then
  // resolve the requested one (all under RLS, so it can only be the org's own).
  const env = await withOrg(ctx.orgId, async (tx) => {
    await ensureEnvironments(tx, ctx.orgId);
    return tx
      .select()
      .from(environments)
      .where(eq(environments.key, parsed.data.environment))
      .limit(1)
      .then((r) => r[0]);
  });
  if (!env) return jsonError(c, 404, "Environment not found.");

  const gen = generateSdkKey();
  const [row] = await db
    .insert(sdkKeys)
    .values({
      organizationId: ctx.orgId,
      environmentId: env.id,
      name: parsed.data.name,
      keyHash: gen.keyHash,
      prefix: gen.prefix,
      lastFour: gen.lastFour,
      createdByUserId: ctx.actorUserId,
    })
    .returning();

  // The one and only time the plaintext is returned.
  return c.json(
    { key: { ...serializeKey(row, env.key), token: gen.token } },
    201,
  );
});

// --- List (masked) -----------------------------------------------------------
sdkKeys_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const envs = await withOrg(ctx.orgId, (tx) => tx.select().from(environments));
  const envKeyById = new Map(envs.map((e) => [e.id, e.key]));

  const rows = await db
    .select()
    .from(sdkKeys)
    .where(eq(sdkKeys.organizationId, ctx.orgId))
    .orderBy(desc(sdkKeys.createdAt));

  return c.json({
    keys: rows.map((k) => serializeKey(k, envKeyById.get(k.environmentId) ?? null)),
  });
});

// --- Revoke ------------------------------------------------------------------
sdkKeys_.post("/:id/revoke", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const id = c.req.param("id");
  const [row] = await db
    .update(sdkKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(sdkKeys.id, id), eq(sdkKeys.organizationId, ctx.orgId)))
    .returning();

  if (!row) return jsonError(c, 404, "SDK key not found.");
  return c.json({ ok: true });
});
