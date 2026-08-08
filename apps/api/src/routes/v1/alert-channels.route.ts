import { Hono } from "hono";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { authContext } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { resolveOrg, requireManager } from "../../lib/org-context.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";
import { withOrg } from "../../db/tenant.js";
import { alertChannels, type AlertChannel } from "../../db/schema.js";
import { hasCapability } from "../../integrations/store.js";
import { getChannelType, listChannelTypes } from "../../checks/channel-types.js";
import { buildTestContent } from "../../checks/notify.js";

/**
 * Alert channels API — reusable destinations that check alerts deliver to. Registry-driven
 * (checks/channel-types.ts): Email and Webhook are built in; SMS and Phone deliver through
 * the org's connected Integration (Twilio) and require its capability to be connected.
 * Channels are org-global (a check selects the ones it wants). Mounted under
 * /v1/orgs/:org/alert-channels.
 */
export const alertChannels_ = new Hono();

alertChannels_.use("*", authContext);

const TAG = "Alert channels";
const params = { org: "The organization slug.", id: "The alert channel id." };

function serialize(row: AlertChannel) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    config: row.config,
    sendOnFailure: row.sendOnFailure,
    sendOnRecovery: row.sendOnRecovery,
    sendOnDegraded: row.sendOnDegraded,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const channelSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string(),
  config: z.record(z.string(), z.unknown()),
  sendOnFailure: z.boolean(),
  sendOnRecovery: z.boolean(),
  sendOnDegraded: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
registerComponentSchema("AlertChannel", channelSchema);
registerComponentSchema("AlertChannelList", z.object({ channels: z.array(channelSchema) }));
registerComponentSchema("AlertChannelResponse", z.object({ channel: channelSchema }));

const events = {
  sendOnFailure: z.boolean().optional(),
  sendOnRecovery: z.boolean().optional(),
  sendOnDegraded: z.boolean().optional(),
  enabled: z.boolean().optional(),
};

// Registry-driven: `type` picks a channel type and `config` is validated by that type's
// own schema (checks/channel-types.ts). New types need no change here.
const createSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1).max(200),
  config: z.record(z.string(), z.unknown()),
  ...events,
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  ...events,
});

registerComponentSchema(
  "AlertChannelTypeList",
  z.object({
    channelTypes: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        description: z.string(),
        gatesCapability: z.string().nullable(),
      }),
    ),
  }),
);
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/alert-channels/types",
  summary: "List alert channel types",
  description: "The channel types this org can create, and which Integration capability each needs.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  responses: { 200: { description: "The available channel types.", schemaName: "AlertChannelTypeList" } },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/alert-channels",
  summary: "List alert channels",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  responses: { 200: { description: "The org's alert channels.", schemaName: "AlertChannelList" } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/alert-channels",
  summary: "Create an alert channel",
  description: "Create a channel that check alerts deliver to. Email is supported today. Owner/admin only.",
  tags: [TAG],
  auth: true,
  paramDescriptions: { org: params.org },
  request: { body: createSchema },
  responses: {
    200: { description: "The created channel.", schemaName: "AlertChannelResponse" },
    422: { description: "The submitted data failed validation." },
  },
});
registerRoute({
  method: "get",
  path: "/v1/orgs/{org}/alert-channels/{id}",
  summary: "Get an alert channel",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The channel.", schemaName: "AlertChannelResponse" },
    404: { description: "No such channel." },
  },
});
registerRoute({
  method: "patch",
  path: "/v1/orgs/{org}/alert-channels/{id}",
  summary: "Update an alert channel",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  request: { body: updateSchema },
  responses: {
    200: { description: "The updated channel.", schemaName: "AlertChannelResponse" },
    404: { description: "No such channel." },
  },
});
registerRoute({
  method: "delete",
  path: "/v1/orgs/{org}/alert-channels/{id}",
  summary: "Delete an alert channel",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: { 200: { description: "Deleted.", schemaName: "DeleteAck" }, 404: { description: "No such channel." } },
});
registerRoute({
  method: "post",
  path: "/v1/orgs/{org}/alert-channels/{id}/test",
  summary: "Send a test alert",
  description: "Deliver a test notification through the channel now, to verify it works.",
  tags: [TAG],
  auth: true,
  paramDescriptions: params,
  responses: {
    200: { description: "The test was sent.", schemaName: "DeleteAck" },
    404: { description: "No such channel." },
    422: { description: "The channel has no deliverable destination." },
  },
});

async function loadChannel(orgId: string, id: string): Promise<AlertChannel | null> {
  const row = (
    await withOrg(orgId, (tx) => tx.select().from(alertChannels).where(eq(alertChannels.id, id)).limit(1))
  )[0];
  return row ?? null;
}

alertChannels_.get("/types", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  return c.json({
    channelTypes: listChannelTypes().map((t) => ({
      key: t.key,
      label: t.label,
      description: t.description,
      gatesCapability: t.gatesCapability,
    })),
  });
});

alertChannels_.get("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const rows = await withOrg(ctx.orgId, (tx) =>
    tx.select().from(alertChannels).orderBy(desc(alertChannels.createdAt)),
  );
  return c.json({ channels: rows.map(serialize) });
});

alertChannels_.post("/", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const body = parsed.data;

  const channelType = getChannelType(body.type);
  if (!channelType) return jsonError(c, 422, `Unknown alert channel type "${body.type}".`);

  const config = channelType.configSchema.safeParse(body.config);
  if (!config.success) return validationError(c, config.error);

  // Integration-backed types (SMS / phone) require the capability to be connected.
  if (channelType.gatesCapability && !(await hasCapability(ctx.orgId, channelType.gatesCapability))) {
    return jsonError(
      c,
      422,
      `Connect an integration that can ${channelType.gatesCapability === "sms" ? "send SMS" : "place calls"} before adding this channel.`,
    );
  }

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx
      .insert(alertChannels)
      .values({
        organizationId: ctx.orgId,
        type: channelType.key,
        name: body.name,
        config: config.data,
        sendOnFailure: body.sendOnFailure ?? true,
        sendOnRecovery: body.sendOnRecovery ?? true,
        sendOnDegraded: body.sendOnDegraded ?? false,
        enabled: body.enabled ?? true,
        createdByUserId: ctx.actorUserId,
      })
      .returning(),
  );
  return c.json({ channel: serialize(row!) });
});

alertChannels_.get("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const channel = await loadChannel(ctx.orgId, c.req.param("id"));
  if (!channel) return jsonError(c, 404, "No such alert channel.");
  return c.json({ channel: serialize(channel) });
});

alertChannels_.patch("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;

  const channel = await loadChannel(ctx.orgId, c.req.param("id"));
  if (!channel) return jsonError(c, 404, "No such alert channel.");

  const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  const body = parsed.data;

  const set: Partial<AlertChannel> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.config !== undefined) {
    const channelType = getChannelType(channel.type);
    if (!channelType) return jsonError(c, 422, `Unknown alert channel type "${channel.type}".`);
    const config = channelType.configSchema.safeParse(body.config);
    if (!config.success) return validationError(c, config.error);
    set.config = config.data;
  }
  if (body.sendOnFailure !== undefined) set.sendOnFailure = body.sendOnFailure;
  if (body.sendOnRecovery !== undefined) set.sendOnRecovery = body.sendOnRecovery;
  if (body.sendOnDegraded !== undefined) set.sendOnDegraded = body.sendOnDegraded;
  if (body.enabled !== undefined) set.enabled = body.enabled;

  const [row] = await withOrg(ctx.orgId, (tx) =>
    tx.update(alertChannels).set({ ...set, updatedAt: new Date() }).where(eq(alertChannels.id, channel.id)).returning(),
  );
  return c.json({ channel: serialize(row!) });
});

alertChannels_.delete("/:id", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const denied = requireManager(c, ctx);
  if (denied) return denied;
  const channel = await loadChannel(ctx.orgId, c.req.param("id"));
  if (!channel) return jsonError(c, 404, "No such alert channel.");
  await withOrg(ctx.orgId, (tx) => tx.delete(alertChannels).where(eq(alertChannels.id, channel.id)));
  return c.json({ ok: true });
});

alertChannels_.post("/:id/test", async (c) => {
  const ctx = await resolveOrg(c);
  if (ctx instanceof Response) return ctx;
  const channel = await loadChannel(ctx.orgId, c.req.param("id"));
  if (!channel) return jsonError(c, 404, "No such alert channel.");

  const channelType = getChannelType(channel.type);
  if (!channelType) return jsonError(c, 422, `Unknown alert channel type "${channel.type}".`);

  const content = buildTestContent(ctx.orgSlug, channel.name);
  const res = await channelType.deliver(ctx.orgId, channel.config as Record<string, unknown>, content);
  if (!res.ok) return jsonError(c, 502, res.message ?? "The test could not be delivered.");
  return c.json({ ok: true });
});
