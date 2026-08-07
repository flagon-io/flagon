import { Hono } from "hono";
import { z } from "zod";
import { authContext } from "../../lib/auth-context.js";
import { jsonError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { getProvider, listProviders } from "../../integrations/providers.js";
import {
  deleteIntegration,
  listIntegrations,
  loadCredentials,
  recordTest,
  saveIntegration,
  updateOptions,
  type IntegrationView,
} from "../../integrations/store.js";
import { secretsEnabled } from "../../lib/crypto/secret-box.js";

/**
 * Bring-your-own-provider integrations. Mounted under /v1/orgs/:org/integrations.
 *
 * The org supplies a third party's credentials (Twilio today) and Flagon calls
 * that service on their behalf. Secrets are write-only over the API: they go IN
 * on configure and are used internally for delivery, but never come back out —
 * only non-secret config + masked hints do. Configuring/removing credentials is
 * a manager action (owner/admin), like any other credential surface.
 *
 * This is NOT Slack/Discord app-installs (Flagon-owned credentials) nor the
 * general outbound-webhook system — both are separate and land on their own.
 */
export const integrations_ = new Hono();

integrations_.use("*", authContext);

// --- OpenAPI registration ----------------------------------------------------
const TAG = "Integrations";
const params = { org: "The organization slug.", provider: "The provider key (e.g. `twilio`)." };
const WRITE_429 = {
  description: "Too many management writes; retry after the Retry-After delay.",
};

const fieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["text", "tel"]),
  required: z.boolean(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  secret: z.boolean().describe("Secret fields are encrypted and write-only."),
});

const integrationSchema = z.object({
  provider: z.string(),
  status: z.enum(["connected", "error", "disabled"]),
  connected: z.boolean(),
  config: z.record(z.string(), z.unknown()).describe("Non-secret settings, verbatim."),
  hints: z.record(z.string(), z.string()).describe("Masked last-4 hints per secret field."),
  lastError: z.string().nullable(),
  lastTestedAt: z.string().nullable().describe("ISO 8601 timestamp"),
  createdAt: z.string().describe("ISO 8601 timestamp"),
  updatedAt: z.string().describe("ISO 8601 timestamp"),
});

const optionSchema = z.object({
  key: z.string(),
  label: z.string(),
  help: z.string().optional(),
  default: z.boolean(),
  gatesCapability: z.string().optional().describe("The capability this toggle enables/disables."),
});

const catalogEntrySchema = z.object({
  key: z.string(),
  label: z.string(),
  category: z.string(),
  summary: z.string(),
  docsPath: z.string().optional(),
  capabilities: z.array(z.string()),
  fields: z.array(fieldSchema),
  options: z.array(optionSchema).describe("Behavior toggles (how Flagon uses this integration)."),
  integration: integrationSchema.nullable().describe("The org's config, or null if unconfigured."),
});

registerComponentSchema("Integration", integrationSchema);
registerComponentSchema("IntegrationField", fieldSchema);
registerComponentSchema("IntegrationOption", optionSchema);
registerComponentSchema("IntegrationCatalogEntry", catalogEntrySchema);
registerComponentSchema(
  "IntegrationCatalogResponse",
  z.object({
    secretsEnabled: z
      .boolean()
      .describe("Whether the server can store BYO secrets (INTEGRATIONS_SECRET_KEY set)."),
    providers: z.array(catalogEntrySchema),
  }),
);
registerComponentSchema("IntegrationResponse", z.object({ integration: integrationSchema }));
registerComponentSchema(
  "IntegrationTestResponse",
  z.object({
    integration: integrationSchema,
    test: z.object({ ok: z.boolean(), message: z.string().optional() }),
  }),
);

const configureBody = z.object({}).catchall(z.string()).describe(
  "A flat map of the provider's field keys to values (see the catalog `fields`).",
);

registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/integrations",
  summary: "List integrations",
  description:
    "List every bring-your-own provider Flagon offers, each merged with this org's configuration (or null if unconfigured). Secrets are never returned — only non-secret config and masked hints.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The provider catalog with per-org config.", schemaName: "IntegrationCatalogResponse" },
  },
});

registerRoute({
  method: "put",
  path: "/v1/orgs/{org}/integrations/{provider}",
  summary: "Configure an integration",
  description:
    "Set (or replace) the org's credentials for a provider. The submitted values are validated, a live connection test is run, and the credentials are stored encrypted. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: configureBody },
  responses: {
    200: { description: "The stored integration (secret-free).", schemaName: "IntegrationResponse" },
    404: { description: "No such provider." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
    503: { description: "Secret storage is not configured on this deployment." },
  },
});

registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/integrations/{provider}",
  summary: "Update integration behavior",
  description:
    "Update how Flagon uses the integration (its behavior options, e.g. whether Twilio sends SMS and/or places voice calls) without changing the stored credentials. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: {
    body: z
      .object({ options: z.record(z.string(), z.boolean()) })
      .describe("A map of option keys to on/off values (see the catalog `options`)."),
  },
  responses: {
    200: { description: "The updated integration.", schemaName: "IntegrationResponse" },
    404: { description: "No such provider, or it isn't configured." },
    422: { description: "The submitted data failed validation." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/integrations/{provider}/test",
  summary: "Test an integration",
  description:
    "Re-run the provider's live connection test against the stored credentials, and record the result. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The test result and refreshed integration.", schemaName: "IntegrationTestResponse" },
    404: { description: "No such provider, or it isn't configured." },
    429: WRITE_429,
  },
});

registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/integrations/{provider}",
  summary: "Remove an integration",
  description: "Delete the org's credentials for a provider. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The integration was removed.", schemaName: "DeleteAck" },
    404: { description: "No such provider, or it isn't configured." },
    429: WRITE_429,
  },
});

// --- Handlers ----------------------------------------------------------------

// List: the full provider catalog, each merged with this org's config.
integrations_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;

  const configured = new Map<string, IntegrationView>(
    (await listIntegrations(ctx.orgId)).map((i) => [i.provider, i]),
  );
  const providers = listProviders().map((p) => ({
    key: p.key,
    label: p.label,
    category: p.category,
    summary: p.summary,
    docsPath: p.docsPath,
    capabilities: p.capabilities,
    fields: p.fields,
    options: p.options,
    integration: configured.get(p.key) ?? null,
  }));
  return c.json({ secretsEnabled: secretsEnabled(), providers });
});

// Configure (create or replace): validate → live test → store encrypted.
integrations_.put("/:provider", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const provider = getProvider(c.req.param("provider"));
  if (!provider) return jsonError(c, 404, "Unknown integration provider.");
  if (!secretsEnabled()) {
    return jsonError(
      c,
      503,
      "Secret storage isn't configured on this deployment. Set INTEGRATIONS_SECRET_KEY to store integration credentials.",
    );
  }

  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return jsonError(c, 422, "Expected a JSON object of field values.");
  }

  let values;
  try {
    values = provider.normalize(body);
  } catch (err) {
    return jsonError(c, 422, err instanceof Error ? err.message : "Invalid configuration.");
  }

  // Verify the credentials before we commit them, and record the outcome so the
  // console can surface a bad token immediately rather than at first delivery.
  const test = await provider.test(values);
  const integration = await saveIntegration({
    orgId: ctx.orgId,
    provider,
    values,
    actorUserId: ctx.actorUserId,
    test,
  });
  return c.json({ integration });
});

// Update behavior options (how Flagon uses it) — no credential change.
integrations_.patch("/:provider", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const provider = getProvider(c.req.param("provider"));
  if (!provider) return jsonError(c, 404, "Unknown integration provider.");

  const body = (await c.req.json().catch(() => null)) as { options?: unknown } | null;
  const options = body?.options;
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return jsonError(c, 422, "Expected an `options` object of on/off values.");
  }
  const updates: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(options as Record<string, unknown>)) {
    if (typeof v !== "boolean") {
      return jsonError(c, 422, `Option \`${k}\` must be true or false.`);
    }
    updates[k] = v;
  }

  const integration = await updateOptions(ctx.orgId, provider, updates);
  if (!integration) return jsonError(c, 404, "That integration isn't configured.");
  return c.json({ integration });
});

// Test: re-run the live check against stored credentials.
integrations_.post("/:provider/test", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const provider = getProvider(c.req.param("provider"));
  if (!provider) return jsonError(c, 404, "Unknown integration provider.");

  const values = await loadCredentials(ctx.orgId, provider.key);
  if (!values) return jsonError(c, 404, "That integration isn't configured.");

  const test = await provider.test(values);
  const integration = await recordTest(ctx.orgId, provider.key, test);
  if (!integration) return jsonError(c, 404, "That integration isn't configured.");
  return c.json({ integration, test });
});

// Remove.
integrations_.delete("/:provider", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const provider = getProvider(c.req.param("provider"));
  if (!provider) return jsonError(c, 404, "Unknown integration provider.");
  const removed = await deleteIntegration(ctx.orgId, provider.key);
  if (!removed) return jsonError(c, 404, "That integration isn't configured.");
  return c.json({ ok: true });
});
