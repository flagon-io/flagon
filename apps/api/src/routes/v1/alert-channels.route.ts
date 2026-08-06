import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, type TenantTx } from "../../db/tenant.js";
import { alertChannels, type AlertChannelConfig } from "../../db/schema.js";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { isValidSlug } from "../../lib/slug.js";
import { encryptSecret, encryptionAvailable } from "../../lib/crypto.js";
import { deliver } from "../../notifications/providers.js";
import { env } from "../../env.js";

/**
 * Alert channels — reusable, org-level OUTBOUND destinations (a Slack incoming
 * webhook, a generic webhook, a shared mailbox). Producers (synthetic checks now;
 * incidents and flag events later) reference a channel by key and enqueue onto the
 * spine; the drain sweep delivers. Mounted at /v1/orgs/:org/alert-channels. Managing
 * channels is owner/admin; everything runs inside withOrg() so RLS enforces tenancy.
 *
 * Secret URLs (Slack/webhook) are encrypted at rest (lib/crypto) and NEVER returned
 * to a client — a channel serializes with `configured: true`, not the URL. Email
 * addresses are not secrets and are returned as-is.
 */
export const alertChannels_ = new Hono();
alertChannels_.use("*", authContext);

const TAG = "Alert channels";
const TYPES = ["slack_webhook", "webhook", "email"] as const;
/** Channel types whose config carries a bearer secret we must encrypt. */
const SECRET_TYPES = new Set<string>(["slack_webhook", "webhook"]);

const createBody = z.object({
  key: z.string().trim().min(1).max(48),
  name: z.string().trim().min(1).max(80),
  type: z.enum(TYPES),
  url: z.string().url().max(2000).optional(),
  method: z.enum(["POST", "PUT"]).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  channelLabel: z.string().trim().max(80).optional(),
  addresses: z.array(z.string().email()).max(20).optional(),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    url: z.string().url().max(2000).optional(),
    method: z.enum(["POST", "PUT"]).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    channelLabel: z.string().trim().max(80).optional(),
    addresses: z.array(z.string().email()).max(20).optional(),
  })
  .strict();

const channelSchema = z.object({
  key: z.string(),
  name: z.string(),
  type: z.string(),
  enabled: z.boolean(),
  health: z.string(),
  lastError: z.string().nullable(),
  lastDeliveredAt: z.string().nullable(),
  configured: z.boolean(),
  channelLabel: z.string().nullable(),
  method: z.string().nullable(),
  addresses: z.array(z.string()),
});
registerComponentSchema("AlertChannel", channelSchema);
registerComponentSchema("AlertChannelListResponse", z.array(channelSchema));

const pParams = { org: "The organization slug." };
const kParams = { ...pParams, key: "The alert channel key." };
registerRoute({ method: "get", path: "/v1/orgs/{org}/alert-channels", summary: "List alert channels", description: "Reusable outbound destinations (Slack/webhook/email). Secrets are never returned.", tags: [TAG], auth: true, paramDescriptions: pParams, responses: { 200: { description: "Channels.", schemaName: "AlertChannelListResponse" } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/alert-channels", summary: "Create an alert channel", description: "Create a destination. slack_webhook/webhook require a url (stored encrypted); email requires addresses. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: pParams, request: { body: createBody }, responses: { 201: { description: "Created.", schemaName: "AlertChannel" }, 400: { description: "Invalid key/config or encryption not configured." }, 409: { description: "Key taken." }, 422: { description: "Validation failed." } } });
registerRoute({ method: "patch", path: "/v1/orgs/{org}/alert-channels/{key}", summary: "Update an alert channel", tags: [TAG], auth: true, paramDescriptions: kParams, request: { body: updateBody }, responses: { 200: { description: "Updated.", schemaName: "AlertChannel" }, 404: { description: "No such channel." } } });
registerRoute({ method: "delete", path: "/v1/orgs/{org}/alert-channels/{key}", summary: "Delete an alert channel", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such channel." } } });
registerRoute({ method: "post", path: "/v1/orgs/{org}/alert-channels/{key}/test", summary: "Send a test notification", description: "Deliver a test message through the channel now and return the outcome. Owner/admin only.", tags: [TAG], auth: true, paramDescriptions: kParams, responses: { 200: { description: "Delivery attempted.", schemaName: "AlertChannelTestResponse" }, 404: { description: "No such channel." } } });
registerComponentSchema("AlertChannelTestResponse", z.object({ ok: z.boolean(), statusCode: z.number().nullable(), error: z.string().nullable() }));

type ChannelRow = typeof alertChannels.$inferSelect;
function serialize(ch: ChannelRow) {
  const cfg = ch.config ?? {};
  return {
    key: ch.key,
    name: ch.name,
    type: ch.type,
    enabled: ch.enabled,
    health: ch.health,
    lastError: ch.lastError,
    lastDeliveredAt: ch.lastDeliveredAt?.toISOString() ?? null,
    // Never expose the secret URL — only whether one is set.
    configured: ch.type === "email" ? (cfg.addresses?.length ?? 0) > 0 : Boolean(cfg.url),
    channelLabel: cfg.channelLabel ?? null,
    method: cfg.method ?? null,
    addresses: cfg.addresses ?? [],
  };
}

async function channelByKey(tx: TenantTx, key: string) {
  return tx.select().from(alertChannels).where(eq(alertChannels.key, key)).limit(1).then((r) => r[0] ?? null);
}

/** Build the stored config for a type, encrypting the secret URL. Returns an error
 *  string when the input is invalid for the type or encryption is unavailable. */
function buildConfig(
  type: string,
  input: { url?: string; method?: string; headers?: Record<string, string>; channelLabel?: string; addresses?: string[] },
): { config: AlertChannelConfig } | { error: string } {
  if (type === "email") {
    if (!input.addresses || input.addresses.length === 0) return { error: "An email channel needs at least one address." };
    return { config: { addresses: input.addresses } };
  }
  // slack_webhook | webhook — both carry a secret URL.
  if (!input.url) return { error: "This channel type needs a webhook url." };
  if (!encryptionAvailable()) return { error: "Set INTEGRATIONS_ENC_KEY on the API to store Slack/webhook secrets." };
  const config: AlertChannelConfig = { url: encryptSecret(input.url) };
  if (type === "slack_webhook" && input.channelLabel) config.channelLabel = input.channelLabel;
  if (type === "webhook") {
    if (input.method) config.method = input.method;
    if (input.headers) config.headers = input.headers;
  }
  return { config };
}

alertChannels_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json(
    await withOrg(ctx.orgId, async (tx) => {
      const rows = await tx.select().from(alertChannels).orderBy(desc(alertChannels.createdAt));
      return rows.map(serialize);
    }),
  );
});

alertChannels_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = createBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const { key, name, type } = parsed.data;
  if (!isValidSlug(key)) return jsonError(c, 400, "Choose a different channel key (letters, numbers, dashes).");
  const built = buildConfig(type, parsed.data);
  if ("error" in built) return jsonError(c, 400, built.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    if (await channelByKey(tx, key)) return "conflict" as const;
    const [row] = await tx
      .insert(alertChannels)
      .values({ organizationId: ctx.orgId, key, name, type, config: built.config, createdByUserId: ctx.actorUserId })
      .returning();
    return { row };
  });
  if (result === "conflict") return jsonError(c, 409, "An alert channel with that key already exists.");
  return c.json(serialize(result.row), 201);
});

alertChannels_.patch("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const parsed = updateBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const result = await withOrg(ctx.orgId, async (tx) => {
    const ch = await channelByKey(tx, c.req.param("key"));
    if (!ch) return null;
    const patch: Partial<ChannelRow> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
    // Any config field present re-builds the config for this channel's type.
    const touchesConfig =
      parsed.data.url !== undefined ||
      parsed.data.method !== undefined ||
      parsed.data.headers !== undefined ||
      parsed.data.channelLabel !== undefined ||
      parsed.data.addresses !== undefined;
    if (touchesConfig) {
      const merged = {
        url: parsed.data.url,
        method: parsed.data.method ?? ch.config?.method,
        headers: parsed.data.headers ?? ch.config?.headers,
        channelLabel: parsed.data.channelLabel ?? ch.config?.channelLabel,
        addresses: parsed.data.addresses ?? ch.config?.addresses,
      };
      // On update, a missing url keeps the existing (encrypted) one.
      const built = parsed.data.url !== undefined ? buildConfig(ch.type, merged) : { config: { ...ch.config, method: merged.method, headers: merged.headers, channelLabel: merged.channelLabel, addresses: merged.addresses } as AlertChannelConfig };
      if ("error" in built) return { ok: false as const, error: built.error };
      patch.config = built.config;
      // A re-configured channel gets a fresh health slate.
      patch.health = "unknown";
      patch.lastError = null;
    }
    const [row] = await tx.update(alertChannels).set(patch).where(eq(alertChannels.id, ch.id)).returning();
    return { ok: true as const, row };
  });
  if (!result) return jsonError(c, 404, "Alert channel not found.");
  if (!result.ok) return jsonError(c, 400, result.error);
  return c.json(serialize(result.row));
});

alertChannels_.delete("/:key", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const ok = await withOrg(ctx.orgId, async (tx) => {
    const ch = await channelByKey(tx, c.req.param("key"));
    if (!ch) return false;
    await tx.delete(alertChannels).where(eq(alertChannels.id, ch.id));
    return true;
  });
  if (!ok) return jsonError(c, 404, "Alert channel not found.");
  return c.json({ ok: true });
});

alertChannels_.post("/:key/test", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const ch = await withOrg(ctx.orgId, (tx) => channelByKey(tx, c.req.param("key")));
  if (!ch) return jsonError(c, 404, "Alert channel not found.");
  const appUrl = env.APP_URL ?? "http://localhost:3001";
  // Deliver inline for immediate feedback (the async spine is for real events).
  const outcome = await deliver(ch, {
    title: "Flagon test alert",
    body: `A test message from Flagon for the "${ch.name}" channel. If you can see this, delivery works.`,
    severity: "info",
    kind: "test",
    url: `${appUrl}/${ctx.orgSlug}/settings/alert-channels`,
  });
  // Reflect the result on the channel's health so the UI stays honest.
  const at = new Date();
  await withOrg(ctx.orgId, (tx) =>
    tx
      .update(alertChannels)
      .set(outcome.ok ? { health: "ok", lastError: null, lastDeliveredAt: at, updatedAt: at } : { health: "failing", lastError: (outcome.error ?? "").slice(0, 500), updatedAt: at })
      .where(eq(alertChannels.id, ch.id)),
  );
  return c.json({ ok: outcome.ok, statusCode: outcome.statusCode ?? null, error: outcome.error ?? null });
});
