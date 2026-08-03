import { Hono } from "hono";
import { isBillingConfigured } from "../../lib/stripe.js";
import { sweepUsageReports } from "../../usage/report-sweep.js";
import { flushMonitoring } from "../../lib/monitoring.js";

/**
 * Internal cron endpoints — mounted at /internal, OUTSIDE /v1 (no auth-context, no
 * management rate limit). Authenticated by a shared `CRON_SECRET` bearer token, which
 * Vercel Cron injects as `Authorization: Bearer <CRON_SECRET>` when that env is set.
 * Vercel Cron issues GET; we accept GET + POST.
 */
export const internal = new Hono();

function cronAuthorized(authHeader: string | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  // Fail closed: no configured secret => the endpoint is never callable.
  return Boolean(secret) && authHeader === `Bearer ${secret}`;
}

/**
 * The metered-billing reporting sweep. Reports each active Pro org's unreported usage
 * to the Stripe meter (see usage/report-sweep.ts). Idempotent and safe to run often;
 * Vercel Cron calls it ~every 5 minutes. This is the ONLY place usage is reported.
 */
internal.on(["GET", "POST"], "/cron/report", async (c) => {
  if (!cronAuthorized(c.req.header("authorization"))) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (!isBillingConfigured()) {
    return c.json({ ok: true, skipped: "billing not configured" });
  }
  const result = await sweepUsageReports();
  // Any per-org failures were captured to Sentry inside the sweep (the real alert);
  // flush before the serverless function freezes, or those events are lost. `ok` stays
  // endpoint-liveness (did the sweep run) so a single transient org failure that
  // self-heals next sweep doesn't page; `failed` is surfaced as data a monitor can read.
  await flushMonitoring();
  return c.json({ ok: true, ...result });
});
