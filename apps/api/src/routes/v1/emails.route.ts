import { Hono } from "hono";
import type { Context } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { userEmails } from "../../db/auth-tables.js";
import { getAuth } from "../../lib/auth-context.js";
import { jsonError } from "../../lib/http.js";
import {
  emailExists,
  listUserEmails,
  setPrimaryEmail,
} from "../../lib/user-emails.js";
import { createEmailSender } from "../../lib/email/sender.js";
import { changeEmailTemplate } from "../../lib/email/templates.js";
import { signToken, verifyToken } from "../../lib/token.js";
import { registerRoute, registerComponentSchema } from "../../openapi/registry.js";

/**
 * GitHub-style multi-email management. Mounted at /v1/me/emails (session-authed
 * via the parent /me mount). Adding an address stores it unverified and emails a
 * signed confirmation link; only verified addresses can be made primary or used
 * to sign in. The API owns this now (was console direct-DB writes).
 *
 * The confirmation link points at the PUBLIC verify endpoint (`emailVerify_`,
 * mounted at /v1/email/verify) — token-authed, no session, since it is clicked
 * from an email. It flips the address to verified and redirects to the console.
 */
export const meEmails_ = new Hono();
export const emailVerify_ = new Hono();

const TAG = "Emails";
const VERIFY_TTL = 24 * 60 * 60 * 1000; // 24h
const emailSchema = z.string().trim().toLowerCase().email().max(320);
const body = z.object({ email: emailSchema });

const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
const SELF_URL =
  process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? "3002"}`;

registerComponentSchema(
  "EmailListResponse",
  z.array(
    z.object({
      email: z.string(),
      verified: z.boolean(),
      isPrimary: z.boolean(),
      createdAt: z.string(),
    }),
  ),
);
const ackParams = {};
registerRoute({
  method: "get",
  path: "/v1/me/emails",
  summary: "List your emails",
  description: "Every email on your account, primary first. You can sign in with any verified one.",
  tags: [TAG],
  auth: true,
  responses: { 200: { description: "Your emails.", schemaName: "EmailListResponse" } },
});
registerRoute({
  method: "post",
  path: "/v1/me/emails",
  summary: "Add an email",
  description: "Add a secondary email address; a signed confirmation link is sent to it.",
  tags: [TAG],
  auth: true,
  request: { body },
  responses: { 200: { description: "Confirmation link sent.", schemaName: "DeleteAck" }, 422: { description: "Invalid email." } },
  paramDescriptions: ackParams,
});
registerRoute({
  method: "post",
  path: "/v1/me/emails/primary",
  summary: "Set primary email",
  description: "Promote a verified address to primary. Sign-in and notifications follow the primary.",
  tags: [TAG],
  auth: true,
  request: { body },
  responses: { 200: { description: "Primary updated.", schemaName: "DeleteAck" }, 400: { description: "Not on your account, or not verified." } },
});

function requireUserId(c: Context): string | Response {
  const auth = getAuth(c);
  if (!auth || auth.kind !== "user")
    return jsonError(c, 401, "A user session is required.");
  return auth.user.id;
}

async function sendVerification(userId: string, email: string) {
  const token = signToken({ kind: "add-email", userId, email }, VERIFY_TTL);
  const url = `${SELF_URL}/v1/email/verify?token=${encodeURIComponent(token)}`;
  const { subject, html } = changeEmailTemplate(url);
  await createEmailSender().send({ to: email, subject, html });
}

meEmails_.get("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const rows = await listUserEmails(userId);
  return c.json(
    rows.map((e) => ({
      email: e.email,
      verified: e.verified,
      isPrimary: e.isPrimary,
      createdAt: e.createdAt.toISOString(),
    })),
  );
});

meEmails_.post("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const auth = getAuth(c);
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 422, "Enter a valid email address.");
  const email = parsed.data.email;

  if (await emailExists(email)) {
    // Do not reveal whether it belongs to someone else; if it is already the
    // caller's primary, say so, otherwise treat as a resend.
    if (auth?.kind === "user" && email === auth.user.email)
      return jsonError(c, 400, "That is already your email.");
  } else {
    await db.insert(userEmails).values({ userId, email, verified: false, isPrimary: false });
  }
  await sendVerification(userId, email);
  return c.json({ ok: true, message: `Confirmation link sent to ${email}.` });
});

meEmails_.post("/resend", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 422, "Enter a valid email address.");
  const email = parsed.data.email;

  const rows = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.email, email)))
    .limit(1);
  if (!rows[0]) return jsonError(c, 404, "That email is not on your account.");
  if (rows[0].verified) return jsonError(c, 400, "That email is already verified.");
  await sendVerification(userId, email);
  return c.json({ ok: true, message: `Confirmation link resent to ${email}.` });
});

meEmails_.post("/primary", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const parsed = body.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return jsonError(c, 422, "Enter a valid email address.");
  try {
    await setPrimaryEmail(userId, parsed.data.email);
    return c.json({ ok: true, message: `${parsed.data.email} is now your primary email.` });
  } catch (e) {
    return jsonError(c, 400, (e as Error).message);
  }
});

meEmails_.delete("/", async (c) => {
  const userId = requireUserId(c);
  if (userId instanceof Response) return userId;
  const email = (c.req.query("email") ?? "").trim().toLowerCase();
  const rows = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.email, email)))
    .limit(1);
  const row = rows[0];
  if (!row) return jsonError(c, 404, "That email is not on your account.");
  if (row.isPrimary)
    return jsonError(c, 400, "You cannot remove your primary email. Set another first.");
  await db.delete(userEmails).where(eq(userEmails.id, row.id));
  return c.json({ ok: true, message: `${email} removed.` });
});

// --- Public: verify a secondary email from its signed link ------------------
emailVerify_.get("/", async (c) => {
  const token = c.req.query("token");
  const data = token
    ? verifyToken<{ kind: string; userId: string; email: string }>(token)
    : null;

  if (!data || data.kind !== "add-email") {
    return c.redirect(`${APP_URL}/settings/emails?error=invalid`);
  }
  await db
    .update(userEmails)
    .set({ verified: true })
    .where(and(eq(userEmails.userId, data.userId), eq(userEmails.email, data.email)));
  return c.redirect(`${APP_URL}/settings/emails?verified=1`);
});
