import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import { checks, type Check } from "../db/schema.js";
import { captureError } from "../lib/monitoring.js";
import { getMonitorType } from "./monitors/index.js";
import type { RunResult } from "./monitors/types.js";
import { recordRun, type RecordedRun } from "./runner.js";

/**
 * Run a check's probe IN THE CURRENT PROCESS and record the result. Used by the
 * inline sweep (URL and other in-process monitors), by the run-now endpoint, and —
 * for browser checks — inside the dedicated browser function (which IS the runtime
 * where Chromium is available). The adapter owns its own timeout; this adds a hard
 * outer cap so a misbehaving adapter can never wedge the caller.
 */

// A hard ceiling above any monitor's own timeout (Checkly caps a run at 30s). If an
// adapter ignores its signal, this aborts it so the sweep/function stays bounded.
const OUTER_CAP_MS = 35_000;

export async function executeInline(
  orgId: string,
  orgSlug: string,
  check: Check,
): Promise<RecordedRun | null> {
  const type = getMonitorType(check.type);
  if (!type) {
    // The type isn't registered — normally because it's been GATED to "Soon" (e.g. api,
    // browser) while checks of that type still exist. Skip quietly; the check is inert until
    // the type is re-registered or the check is deleted. Not an error to report each tick.
    return null;
  }

  const runStartedAt = new Date();
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTER_CAP_MS);

  let result: RunResult;
  try {
    result = await type.run(check.config, {
      orgId,
      checkId: check.id,
      now: runStartedAt,
      location: "default",
      signal: controller.signal,
    });
  } catch (err) {
    // Adapters are contracted never to throw; guard anyway so one bad run is a
    // recorded failure, not a lost sweep iteration.
    result = {
      status: "failing",
      latencyMs: Math.round(performance.now() - t0),
      error: {
        code: "adapter_error",
        message: err instanceof Error ? err.message : "The probe threw unexpectedly.",
      },
    };
  } finally {
    clearTimeout(timer);
  }

  return recordRun(orgId, orgSlug, check, result, { runStartedAt });
}

/**
 * Load a check by id and run it inline. The entry point the dedicated browser
 * function (api/checks-browser.js) calls after the sweep dispatches to it — it
 * resolves the org slug (for alert links) and the check row itself, then executes.
 */
export async function runCheckById(
  orgId: string,
  checkId: string,
): Promise<RecordedRun | null> {
  const org = (
    await db
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
  )[0];
  if (!org) return null;

  const check = (
    await withOrg(orgId, (tx) =>
      tx.select().from(checks).where(eq(checks.id, checkId)).limit(1),
    )
  )[0];
  if (!check) return null;

  return executeInline(orgId, org.slug, check);
}
