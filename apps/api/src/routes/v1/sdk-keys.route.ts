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
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

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

// --- OpenAPI registration ----------------------------------------------------
const SDK_KEYS_TAG = "SDK keys";
const sdkKeyParams = {
  org: "The organization slug.",
  id: "The SDK key id.",
};
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/sdk-keys",
  summary: "Mint an SDK key",
  description:
    "Create an SDK key for one environment. The plaintext token is returned once at creation and never again.",
  tags: [SDK_KEYS_TAG],
  auth: true,
  paramDescriptions: sdkKeyParams,
  request: { body: createKey },
  responses: {
    201: {
      description: "The SDK key, including its plaintext token (returned once).",
      schemaName: "SdkKeyCreatedResponse",
    },
    404: { description: "No environment with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/sdk-keys",
  summary: "List SDK keys",
  description: "List the organization's SDK keys as masked metadata. The secret is never returned.",
  tags: [SDK_KEYS_TAG],
  auth: true,
  paramDescriptions: sdkKeyParams,
  responses: {
    200: { description: "The organization's SDK keys (masked).", schemaName: "SdkKeyListResponse" },
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/sdk-keys/{id}/revoke",
  summary: "Revoke an SDK key",
  description: "Revoke an SDK key so it can no longer be used to evaluate flags.",
  tags: [SDK_KEYS_TAG],
  auth: true,
  paramDescriptions: sdkKeyParams,
  responses: {
    200: { description: "The SDK key was revoked.", schemaName: "DeleteAck" },
    404: { description: "No SDK key with that id." },
    429: WRITE_429,
  },
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

// --- Response component schemas ----------------------------------------------
// The masked metadata shape (serializeKey). The plaintext token is NOT part of
// this; it is added only to the create response, returned once.
const sdkKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  environmentKey: z.string().nullable(),
  prefix: z.string(),
  lastFour: z.string(),
  masked: z.string(),
  lastUsedAt: z.string().nullable().describe("ISO 8601 timestamp"),
  revokedAt: z.string().nullable().describe("ISO 8601 timestamp"),
  createdAt: z.string().describe("ISO 8601 timestamp"),
});
registerComponentSchema("SdkKey", sdkKeySchema);
registerComponentSchema(
  "SdkKeyCreatedResponse",
  z.object({
    key: sdkKeySchema.extend({
      token: z
        .string()
        .describe("The plaintext SDK key, returned only once at creation."),
    }),
  }),
);
registerComponentSchema("SdkKeyListResponse", z.object({ keys: z.array(sdkKeySchema) }));

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
