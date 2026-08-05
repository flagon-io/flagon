import { Hono } from "hono";
import type { Context } from "hono";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { notificationChannels } from "../../db/schema.js";
import { getAuth } from "../../lib/auth-context.js";
import { jsonError, validationError } from "../../lib/http.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * Notification channels — how a page reaches YOU (email, SMS, voice, push, Slack).
 * These are PERSONAL and global (a person's phone is the same across orgs), so they
 * live under /v1/me (session-authed via the parent /me mount), NOT under an org.
 * Email delivers today; the others are scaffolded until their providers land.
 */
export const meNotificationChannels_ = new Hono();

const TAG = "Notifications";
// Personal contact channels. (Slack is NOT here — linking Slack is an ORG
// integration, coming with the Integrations surface, not a personal toggle.)
const CHANNEL_TYPES = ["email", "sms", "voice", "push"] as const;
/** Only these actually deliver right now; the rest are scaffolded. */
export const DELIVERABLE_CHANNELS = new Set<string>(["email"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUserId(c: Context): string | Response {
  const auth = getAuth(c);
  if (!auth || auth.kind !== "user") return jsonError(c, 401, "A user session is required.");
  return auth.user.id;
}

const addBody = z
  .object({
    type: z.enum(CHANNEL_TYPES),
    value: z.string().trim().min(1).max(320),
    label: z.string().trim().max(60).optional(),
  })
  // An email channel is emailed as-is when paging, so it must be a real address.
  .refine((v) => v.type !== "email" || z.string().email().safeParse(v.value).success, {
    message: "Enter a valid email address.",
    path: ["value"],
  });

const channelSchema = z.object({
  id: z.string(),
  type: z.string(),
  value: z.string(),
  label: z.string().nullable(),
  verified: z.boolean(),
  deliverable: z.boolean(),
});
registerComponentSchema("NotificationChannel", channelSchema);
registerComponentSchema("NotificationChannelListResponse", z.array(channelSchema));

registerRoute({ method: "get", path: "/v1/me/notification-channels", summary: "List your notification channels", description: "The authenticated user's contact channels for incident paging.", tags: [TAG], auth: true, responses: { 200: { description: "Channels.", schemaName: "NotificationChannelListResponse" } } });
registerRoute({ method: "post", path: "/v1/me/notification-channels", summary: "Add a notification channel", description: "Add a contact channel (email delivers today; sms/voice/push/slack are scaffolded).", tags: [TAG], auth: true, request: { body: addBody }, responses: { 201: { description: "Added.", schemaName: "NotificationChannel" }, 422: { description: "Validation failed." } } });
registerRoute({ method: "delete", path: "/v1/me/notification-channels/{id}", summary: "Remove a notification channel", tags: [TAG], auth: true, paramDescriptions: { id: "The channel id." }, responses: { 200: { description: "Removed.", schemaName: "DeleteAck" }, 404: { description: "No such channel." } } });

function serialize(c: typeof notificationChannels.$inferSelect) {
  return { id: c.id, type: c.type, value: c.value, label: c.label, verified: c.verified, deliverable: DELIVERABLE_CHANNELS.has(c.type) };
}

meNotificationChannels_.get("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const rows = await db.select().from(notificationChannels).where(eq(notificationChannels.userId, userId)).orderBy(asc(notificationChannels.position), asc(notificationChannels.createdAt));
  return c.json(rows.map(serialize));
});

meNotificationChannels_.post("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const parsed = addBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return validationError(c, parsed.error);
  // Email paging still uses the account's primary address, so this is additive.
  const [row] = await db.insert(notificationChannels).values({ userId, type: parsed.data.type, value: parsed.data.value, label: parsed.data.label ?? null }).returning();
  return c.json(serialize(row), 201);
});

meNotificationChannels_.delete("/:id", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return jsonError(c, 404, "Channel not found.");
  const [row] = await db.delete(notificationChannels).where(and(eq(notificationChannels.id, id), eq(notificationChannels.userId, userId))).returning({ id: notificationChannels.id });
  if (!row) return jsonError(c, 404, "Channel not found.");
  return c.json({ ok: true });
});
