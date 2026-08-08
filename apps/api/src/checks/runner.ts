import { eq, sql } from "drizzle-orm";
import { withOrg } from "../db/tenant.js";
import { checks, checkResults, type Check, type CheckResult } from "../db/schema.js";
import { ingestEvents } from "../usage/events.js";
import { captureError } from "../lib/monitoring.js";
import { orgPlan } from "../lib/org-context.js";
import { planAllowsIncidentAutomation } from "../lib/plans.js";
import {
  openIncidentForCheck,
  resolveIncidentForCheck,
  isIncidentNumberConflict,
} from "../incidents/lifecycle.js";
import { getMonitorType, runBillingQuantity } from "./monitors/index.js";
import type { RunResult } from "./monitors/types.js";
import { nextState, type AlertState, type CheckTransition } from "./state.js";
import { sendCheckAlert } from "./notify.js";

/**
 * The shared recording path for a completed probe. Called by every executor — the
 * inline cron sweep, the isolated browser function, and (later) a remote agent
 * posting results — so the record → state-machine → meter → alert sequence lives in
 * ONE place. All persistence runs inside withOrg(); alerting + metering happen after
 * the transaction so a slow mail send or a Stripe hiccup can't hold the row lock.
 */

export type RecordedRun = {
  result: CheckResult;
  transition: CheckTransition;
};

// Failure codes that mean the probe never actually ran (no compute consumed) — so the run
// is recorded for the timeline but NOT metered. `runtime_unavailable` = the browser runtime
// couldn't launch; `adapter_error` = the adapter threw before executing.
const NON_BILLABLE_ERROR_CODES = new Set(["runtime_unavailable", "adapter_error"]);

export async function recordRun(
  orgId: string,
  orgSlug: string,
  check: Check,
  result: RunResult,
  opts: { runStartedAt?: Date } = {},
): Promise<RecordedRun> {
  const now = new Date();
  const runStartedAt = opts.runStartedAt ?? now;

  const transition = nextState(
    {
      status: check.currentStatus as CheckTransition["status"] | "unknown",
      consecutiveFailures: check.consecutiveFailures,
      consecutivePasses: check.consecutivePasses,
      failingSince: check.failingSince,
      alertState: check.alertState as AlertState,
      lastAlertedAt: check.lastAlertedAt,
      lastReminderAt: check.lastReminderAt,
    },
    result.status,
    { trigger: check.alertTrigger, alertOnDegraded: check.alertOnDegraded },
    now,
  );

  const recorded = await withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(checkResults)
      .values({
        organizationId: orgId,
        checkId: check.id,
        runStartedAt,
        status: result.status,
        latencyMs: result.latencyMs ?? null,
        httpStatus: result.httpStatus ?? null,
        location: "default",
        errorCode: result.error?.code ?? null,
        errorMessage: result.error?.message ?? null,
        assertions: result.assertions ?? null,
        detail: result.detail ?? null,
      })
      .returning();

    await tx
      .update(checks)
      .set({
        currentStatus: transition.status,
        consecutiveFailures: transition.consecutiveFailures,
        consecutivePasses: transition.consecutivePasses,
        failingSince: transition.failingSince,
        alertState: transition.alertState,
        lastRunAt: now,
        lastStatusChangeAt: transition.statusChanged ? now : check.lastStatusChangeAt,
        lastAlertedAt: transition.fire === "alert" ? now : check.lastAlertedAt,
        lastReminderAt: transition.fire === "reminder" ? now : check.lastReminderAt,
        updatedAt: now,
      })
      .where(eq(checks.id, check.id));

    return row!;
  });

  // Meter the run — but ONLY for SYNTHETIC types that declare a billing source
  // (browser, later API/multistep). Uptime monitors have no billingSource: they are
  // billed by monitor COUNT (a licensed subscription quantity, see lib/billing.ts),
  // so their runs never ingest a usage event. Metering is idempotent on (check, run
  // start) so a re-recorded run — a browser-function retry — never double-counts; a
  // durable receipt is written but the events counter is untouched (check runs bill
  // on their own meter, not the exposures allowance).
  //
  // Never bill a run that DIDN'T EXECUTE the probe — our runtime was unavailable, or the
  // adapter threw before running. The customer consumed no compute, so it's not a billable
  // run (a run that started and then failed — script error, timeout, assertion — DOES bill).
  const type = getMonitorType(check.type);
  const executed = !(result.error && NON_BILLABLE_ERROR_CODES.has(result.error.code));
  if (type?.billingSource && executed) {
    try {
      await ingestEvents(orgId, runBillingQuantity(type, result), {
        source: type.billingSource,
        idempotencyKey: `${check.id}:${runStartedAt.toISOString()}`,
      });
    } catch (err) {
      captureError(`[checks] metering failed for ${check.key}`, err, {
        check: check.key,
        org: orgSlug,
      });
    }
  }

  // Fire the alert/reminder/recovery the state machine decided on. Best-effort.
  if (transition.fire) {
    await sendCheckAlert(orgId, orgSlug, check, transition.fire, recorded);
  }

  // Incident automation (Pro-gated): a first alert OPENS an incident on the linked
  // service; a recovery RESOLVES it. Best-effort and outside the record tx — a slow
  // incident write must not hold the check row lock or fail the run.
  await applyIncidentAutomation(orgId, check, transition);

  return { result: recorded, transition };
}

/**
 * Open (on alert) or resolve (on recovery) an incident for a check whose owner turned on
 * incident automation and linked a service. Idempotent via the check's `openIncidentId`:
 * one open incident per check at a time. Never throws — failures are captured.
 */
async function applyIncidentAutomation(
  orgId: string,
  check: Check,
  transition: CheckTransition,
): Promise<void> {
  if (!check.incidentAutomation) return;

  try {
    if (transition.fire === "alert" && check.linkedProjectId && !check.openIncidentId) {
      // Defensive re-check of the gate (the create route enforces it too).
      if (!planAllowsIncidentAutomation(await orgPlan(orgId))) return;

      let opened: { id: string; number: number } | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          opened = await withOrg(orgId, (tx) =>
            openIncidentForCheck(tx, orgId, {
              title: `${check.name} is failing`,
              summary: `Opened automatically by the "${check.name}" check.`,
              projectId: check.linkedProjectId!,
              declaredByUserId: check.createdByUserId,
            }),
          );
          break;
        } catch (err) {
          if (attempt < 3 && isIncidentNumberConflict(err)) continue;
          throw err;
        }
      }
      if (opened) {
        await withOrg(orgId, (tx) =>
          tx.update(checks).set({ openIncidentId: opened!.id }).where(eq(checks.id, check.id)),
        );
      }
      return;
    }

    if (transition.fire === "recovery" && check.openIncidentId) {
      const incidentId = check.openIncidentId;
      await withOrg(orgId, (tx) => resolveIncidentForCheck(tx, orgId, incidentId));
      await withOrg(orgId, (tx) =>
        tx.update(checks).set({ openIncidentId: null }).where(eq(checks.id, check.id)),
      );
    }
  } catch (err) {
    captureError(`[checks] incident automation failed for ${check.key}`, err, {
      check: check.key,
      org: orgId,
    });
  }
}
