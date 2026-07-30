import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { withOrg } from "../../db/tenant.js";
import { environments, sdkKeys } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { ensureEnvironments } from "../../flags/environments.js";
import { generateSdkKey } from "../../flags/sdk-key.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Client-key management. Mounted under /v1/orgs/:org/client-keys.
 *
 * sdk_keys is an auth-layer table (see the migration): the eval path must
 * resolve a key to its org BEFORE any org context exists, so it can't be
 * RLS-gated. Management here therefore scopes by organization_id in the query
 * (app layer), exactly as the console does for access tokens. The environment a
 * key belongs to IS validated through withOrg(), so a key can only ever point at
 * one of the caller's own environments. Client keys are publishable, so the
 * plaintext is stored and stays retrievable; the hash is the auth lookup path.
 */
export const sdkKeys_ = new Hono();

sdkKeys_.use("*", authContext);

const createKey = z.object({
  // The label is optional; an unlabelled key is valid and shows as "Unlabelled".
  name: z.string().trim().max(120).optional().default(""),
  environment: z.string().min(1),
});

const renameKey = z.object({ name: z.string().trim().max(120) });

// --- OpenAPI registration ----------------------------------------------------
const CLIENT_KEYS_TAG = "Client keys";
const clientKeyParams = {
  org: "The organization slug.",
  id: "The client key id.",
};
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/client-keys",
  summary: "Create a client key",
  description:
    "Create a client key for one environment. Client keys are publishable, so the response includes the plaintext token and it stays retrievable afterwards.",
  tags: [CLIENT_KEYS_TAG],
  auth: true,
  paramDescriptions: clientKeyParams,
  request: { body: createKey },
  responses: {
    201: {
      description: "The client key, including its plaintext token.",
      schemaName: "ClientKeyCreatedResponse",
    },
    404: { description: "No environment with that key." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/client-keys",
  summary: "List client keys",
  description: "List the organization's client keys. Each includes its plaintext token, since client keys are publishable and retrievable.",
  tags: [CLIENT_KEYS_TAG],
  auth: true,
  paramDescriptions: clientKeyParams,
  responses: {
    200: { description: "The organization's client keys.", schemaName: "ClientKeyListResponse" },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/client-keys/{id}",
  summary: "Rename a client key",
  description: "Change a client key's label. An empty label leaves it unlabelled.",
  tags: [CLIENT_KEYS_TAG],
  auth: true,
  paramDescriptions: clientKeyParams,
  request: { body: renameKey },
  responses: {
    200: { description: "The updated client key.", schemaName: "ClientKey" },
    404: { description: "No client key with that id." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/client-keys/{id}/revoke",
  summary: "Revoke a client key",
  description: "Revoke a client key so it can no longer be used to evaluate flags.",
  tags: [CLIENT_KEYS_TAG],
  auth: true,
  paramDescriptions: clientKeyParams,
  responses: {
    200: { description: "The client key was revoked.", schemaName: "DeleteAck" },
    404: { description: "No client key with that id." },
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
    // Publishable client key, retrievable in full. Null only for legacy keys
    // minted before keys became retrievable (those stay masked).
    token: k.token ?? null,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  };
}

// --- Response component schemas ----------------------------------------------
// Client keys are publishable, so the plaintext `token` is retrievable in list +
// create responses (null only for legacy keys minted before this).
const clientKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  environmentKey: z.string().nullable(),
  prefix: z.string(),
  lastFour: z.string(),
  masked: z.string(),
  token: z
    .string()
    .nullable()
    .describe("The plaintext key (publishable, retrievable). Null for legacy keys."),
  lastUsedAt: z.string().nullable().describe("ISO 8601 timestamp"),
  revokedAt: z.string().nullable().describe("ISO 8601 timestamp"),
  createdAt: z.string().describe("ISO 8601 timestamp"),
});
registerComponentSchema("ClientKey", clientKeySchema);
registerComponentSchema("ClientKeyCreatedResponse", z.object({ key: clientKeySchema }));
registerComponentSchema("ClientKeyListResponse", z.array(clientKeySchema));

// --- Create ------------------------------------------------------------------
sdkKeys_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

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
      // Publishable: store the plaintext so it stays retrievable in the console.
      token: gen.token,
      createdByUserId: ctx.actorUserId,
    })
    .returning();

  return c.json({ key: serializeKey(row, env.key) }, 201);
});

// --- List (retrievable) ------------------------------------------------------
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

  return c.json(
    rows.map((k) => serializeKey(k, envKeyById.get(k.environmentId) ?? null)),
  );
});

// --- Revoke ------------------------------------------------------------------
sdkKeys_.post("/:id/revoke", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const id = c.req.param("id");
  const [row] = await db
    .update(sdkKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(sdkKeys.id, id), eq(sdkKeys.organizationId, ctx.orgId)))
    .returning();

  if (!row) return jsonError(c, 404, "SDK key not found.");
  return c.json({ ok: true });
});

// --- Rename ------------------------------------------------------------------
sdkKeys_.patch("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = renameKey.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);

  const [row] = await db
    .update(sdkKeys)
    .set({ name: parsed.data.name })
    .where(and(eq(sdkKeys.id, c.req.param("id")), eq(sdkKeys.organizationId, ctx.orgId)))
    .returning();
  if (!row) return jsonError(c, 404, "Client key not found.");

  const envKey = await withOrg(ctx.orgId, (tx) =>
    tx
      .select({ key: environments.key })
      .from(environments)
      .where(eq(environments.id, row.environmentId))
      .limit(1)
      .then((r) => r[0]?.key ?? null),
  );
  return c.json({ key: serializeKey(row, envKey) });
});
