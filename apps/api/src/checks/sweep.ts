import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import { checks, type Check } from "../db/schema.js";
import { captureError } from "../lib/monitoring.js";
import { getMonitorType } from "./monitors/index.js";
import { executeInline } from "./execute.js";
import { runBrowserRemote } from "./remote-browser.js";
import { activeWindows, anyWindowSuppresses } from "./maintenance.js";

/**
 * The check scheduler — a per-minute sweep on top of the single Vercel Cron model
 * (routes/internal/cron.route.ts), copying the shape of usage/report-sweep.ts:
 * enumerate orgs from the auth table (no RLS, readable cross-tenant), then for each
 * run inside withOrg() so RLS scopes the reads/writes. Per-org isolation — one org's
 * failure never blocks the batch.
 *
 * For each due check we RESERVE it first (push next_run_at forward by its frequency)
 * so an overlapping/slow sweep can never dispatch the same run twice, THEN dispatch:
 * inline monitors run in-process; browser checks are handed to the dedicated browser
 * function so Chromium never loads on this path.
 */

const BATCH = 100;

export type SweepResult = { orgs: number; ran: number; dispatched: number; failed: number; suppressed: number };

export async function sweepDueChecks(): Promise<SweepResult> {
  const orgs = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(isNull(organizations.deletedAt));

  let ran = 0;
  let dispatched = 0;
  let failed = 0;
  let suppressed = 0;
  // Browser runs go to the dedicated browser function over HTTP; collect them and await
  // ALL at the end (in parallel) so the sweep stays alive until they finish — an aborted /
  // returned caller drops the request and can kill the run mid-flight on serverless.
  const browserRuns: Promise<unknown>[] = [];

  for (const org of orgs) {
    try {
      const due = await withOrg(org.id, (tx) =>
        tx
          .select()
          .from(checks)
          .where(sql`${checks.activated} and not ${checks.muted} and ${checks.nextRunAt} <= now()`)
          .orderBy(checks.nextRunAt)
          .limit(BATCH),
      );

      // Load the org's active maintenance windows once; a window suppresses SCHEDULED
      // runs for the checks it targets (by tag) so they neither run nor alert.
      const now = new Date();
      const windows = due.length ? await activeWindows(org.id, now) : [];

      for (const check of due) {
        // Reserve before running: advance next_run_at by the frequency so a slow or
        // overlapping sweep never dispatches this run again. If execution then fails,
        // the check simply runs again at its next scheduled tick. We reserve even when a
        // maintenance window suppresses the run, so the check resumes cleanly after it.
        await withOrg(org.id, (tx) =>
          tx
            .update(checks)
            .set({
              nextRunAt: sql`now() + (${check.frequencySeconds} * interval '1 second')`,
            })
            .where(eq(checks.id, check.id)),
        );

        if (windows.length && anyWindowSuppresses(windows, check.tags)) {
          suppressed += 1;
          continue;
        }

        const type = getMonitorType(check.type);
        if (type?.runner === "browser") {
          browserRuns.push(runBrowserRemote(org.id, org.slug, check));
          dispatched += 1;
        } else {
          await executeInline(org.id, org.slug, check);
          ran += 1;
        }
      }
    } catch (err) {
      failed += 1;
      captureError(`[checks-sweep] org ${org.slug} failed`, err, { org: org.slug });
    }
  }

  // Wait for the browser runs to complete (recording their own results); allSettled so one
  // failure never rejects the sweep.
  if (browserRuns.length) await Promise.allSettled(browserRuns);

  return { orgs: orgs.length, ran, dispatched, failed, suppressed };
}
