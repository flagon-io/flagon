import { desc, eq } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { checkResults, type Check } from "../db/schema.js";
import { captureError } from "../lib/monitoring.js";
import { serializeResult, type SerializedResult } from "./serialize.js";

/**
 * Running a browser check means handing it to the dedicated browser function and AWAITING
 * it — Chromium isn't in the main bundle, so a browser check can only execute there. The
 * function runs the Playwright probe (in its sandbox), records the result, and returns it,
 * which we relay for "Run now" or simply await for the sweep (which just needs the run to
 * finish so the connection isn't dropped). Never throws.
 *
 * This replaces the old fire-and-forget dispatch: on serverless an aborted/returned caller
 * drops the in-flight request and can kill the callee mid-run, so the browser check never
 * completed. Awaiting keeps the caller alive until the function is done (the main function's
 * maxDuration is raised to cover it).
 */

/**
 * Base URL for reaching the sibling browser function. Prefer a PUBLIC, stable host: the
 * deployment-specific `VERCEL_URL` is behind Deployment Protection (a 401 on internal calls),
 * whereas the production alias / custom domain is public. Order: explicit override →
 * API_URL → the production alias → (last resort) the protected deployment URL.
 */
export function selfBaseUrl(): string {
  if (process.env.CHECKS_BROWSER_URL) return process.env.CHECKS_BROWSER_URL;
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3002";
}

/** Auth + (when present) the Vercel automation-bypass header, so an internal call still gets
 *  through Deployment Protection if it must hit a protected host. */
function browserFnHeaders(secret: string): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${secret}`,
  };
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  return headers;
}

export async function runBrowserRemote(
  orgId: string,
  orgSlug: string,
  check: Check,
  // The PUBLIC base URL to reach the browser function on. "Run now" passes the host the
  // request arrived on (a public custom domain), which sidesteps Deployment Protection on
  // the `*.vercel.app` deployment URL; the sweep omits it and uses selfBaseUrl().
  baseUrl?: string,
): Promise<{ ok: boolean; result: SerializedResult | null }> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    captureError(`[checks] cannot run browser check ${check.key}: no CRON_SECRET`, new Error("no CRON_SECRET"), {
      check: check.key,
      org: orgSlug,
    });
    return { ok: false, result: null };
  }

  // An explicit CHECKS_BROWSER_URL always wins (points at a known-public host); then the
  // caller-provided public host (run-now); then the derived self URL.
  const base = process.env.CHECKS_BROWSER_URL || baseUrl || selfBaseUrl();
  const url = `${base.replace(/\/$/, "")}/checks-browser`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: browserFnHeaders(secret),
      body: JSON.stringify({ orgId, checkId: check.id }),
      // Below the browser function's 60s maxDuration; it responds when the run is recorded.
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) {
      captureError(`[checks] browser function returned ${res.status} for ${check.key}`, new Error(`status ${res.status}`), {
        check: check.key,
        org: orgSlug,
      });
      return { ok: false, result: await latestResult(orgId, check.id) };
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: SerializedResult } | null;
    return { ok: Boolean(body?.ok), result: body?.result ?? (await latestResult(orgId, check.id)) };
  } catch (err) {
    captureError(`[checks] browser run dispatch failed for ${check.key}`, err, { check: check.key, org: orgSlug });
    return { ok: false, result: await latestResult(orgId, check.id) };
  }
}

/** The most recent recorded result for a check — fallback when the fn response lacks one. */
async function latestResult(orgId: string, checkId: string): Promise<SerializedResult | null> {
  try {
    const [row] = await withOrg(orgId, (tx) =>
      tx
        .select()
        .from(checkResults)
        .where(eq(checkResults.checkId, checkId))
        .orderBy(desc(checkResults.runStartedAt))
        .limit(1),
    );
    return row ? serializeResult(row) : null;
  } catch {
    return null;
  }
}
