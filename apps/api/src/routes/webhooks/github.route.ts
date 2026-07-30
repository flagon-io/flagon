import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "../../lib/logger.js";

/**
 * GitHub App webhook. Mounted at /webhooks/github — deliberately OUTSIDE /v1,
 * with no auth-context or org resolution: GitHub authenticates itself by signing
 * the raw body, which we verify against GITHUB_APP_WEBHOOK_SECRET (HMAC-SHA256,
 * `x-hub-signature-256`). We always 2xx a verified event so GitHub stops
 * retrying; 4xx only for "could not verify".
 *
 * Phase 1 scope: verify + acknowledge + log. Reconciling installation state
 * (uninstall / suspend / repo add-remove) into `github_installations` is a
 * CROSS-TENANT write, which our restricted runtime role intentionally cannot do
 * under RLS from a request with no org context. That cleanup will land with a
 * scoped owner path (or SECURITY DEFINER fn); until then a removed installation
 * is caught lazily (repo listing returns 404 → the org disconnects it).
 */
export const githubWebhook = new Hono();

githubWebhook.post("/", async (c) => {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("[github:webhook] GITHUB_APP_WEBHOOK_SECRET is not set");
    return c.text("GitHub webhook not configured.", 503);
  }

  const signature = c.req.header("x-hub-signature-256");
  if (!signature) return c.text("Missing x-hub-signature-256 header.", 400);

  // Raw body is required for signature verification; do not parse first.
  const payload = await c.req.text();
  const expected = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    logger.error("[github:webhook] signature verification failed");
    return c.text("Invalid signature.", 400);
  }

  const eventType = c.req.header("x-github-event") ?? "unknown";
  let action = "";
  try {
    action = (JSON.parse(payload) as { action?: string }).action ?? "";
  } catch {
    /* body already verified; a parse miss is non-fatal */
  }

  // Acknowledge and log. Reconciliation into github_installations is deferred
  // (see file header): it needs a cross-tenant write our RLS role can't perform.
  logger.info(`[github:webhook] ${eventType}${action ? `.${action}` : ""}`);
  return c.body(null, 200);
});
