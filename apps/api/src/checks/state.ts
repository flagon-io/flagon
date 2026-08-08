import type { CheckStatus } from "./monitors/types.js";
import type { CheckAlertTrigger } from "../db/schema.js";

/**
 * The check alerting state machine — pure, so it is exhaustively unit-testable and
 * the runner (checks/runner.ts) stays a thin "record + act" shell.
 *
 * It answers one question per run: given the check's prior state and this run's
 * outcome, what is the new state and should we FIRE anything (a first alert, a
 * reminder while still down, or a recovery)? It mirrors Checkly's model:
 *   - RUN_BASED : alert after N consecutive failed runs (`failed_run_threshold`).
 *   - TIME_BASED: alert after the check has been failing for M minutes.
 *   - reminders : re-notify every `reminderMinutes` while still alerting.
 *   - degraded counts as failing ONLY when the check opted into alert-on-degraded.
 *   - recovery fires only if an alert had fired (no "recovered" noise otherwise).
 */

export type AlertState = "ok" | "alerting";

/** What the runner should deliver as a result of this transition. */
export type AlertFire = null | "alert" | "reminder" | "recovery";

export type CheckStateInput = {
  status: CheckStatus | "unknown";
  consecutiveFailures: number;
  consecutivePasses: number;
  failingSince: Date | null;
  alertState: AlertState;
  lastAlertedAt: Date | null;
  lastReminderAt: Date | null;
};

export type CheckStateConfig = {
  trigger: CheckAlertTrigger;
  alertOnDegraded: boolean;
};

export type CheckTransition = {
  status: CheckStatus;
  consecutiveFailures: number;
  consecutivePasses: number;
  failingSince: Date | null;
  alertState: AlertState;
  fire: AlertFire;
  /** True when the check's evaluated status changed vs the prior status. */
  statusChanged: boolean;
};

const MINUTE_MS = 60_000;

/**
 * Compute the next check state from one run's outcome. Never mutates its inputs.
 */
export function nextState(
  prev: CheckStateInput,
  runStatus: CheckStatus,
  cfg: CheckStateConfig,
  now: Date,
): CheckTransition {
  // Whether this run counts as "failing" for ALERTING. A degraded run is only
  // treated as failing when the check opted in; a hard failure always counts.
  const failing = runStatus === "failing" || (runStatus === "degraded" && cfg.alertOnDegraded);

  const consecutiveFailures = failing ? prev.consecutiveFailures + 1 : 0;
  const consecutivePasses = failing ? 0 : prev.consecutivePasses + 1;
  const failingSince = failing ? (prev.failingSince ?? now) : null;

  let alertState: AlertState = prev.alertState;
  let fire: AlertFire = null;

  if (failing) {
    const thresholdMet =
      cfg.trigger.type === "run_count"
        ? consecutiveFailures >= Math.max(1, cfg.trigger.runs)
        : failingSince != null &&
          now.getTime() - failingSince.getTime() >= Math.max(0, cfg.trigger.minutes) * MINUTE_MS;

    if (prev.alertState === "ok") {
      if (thresholdMet) {
        fire = "alert";
        alertState = "alerting";
      }
    } else {
      // Already alerting: re-notify on the reminder cadence, if configured. Measure
      // from the last reminder, else the initial alert, else now (no double-fire).
      const cadence = cfg.trigger.reminderMinutes;
      if (cadence && cadence > 0) {
        const since = prev.lastReminderAt ?? prev.lastAlertedAt ?? now;
        if (now.getTime() - since.getTime() >= cadence * MINUTE_MS) fire = "reminder";
      }
    }
  } else if (prev.alertState === "alerting") {
    // A good run while we were alerting: the check recovered.
    fire = "recovery";
    alertState = "ok";
  }

  return {
    status: runStatus,
    consecutiveFailures,
    consecutivePasses,
    failingSince,
    alertState,
    fire,
    statusChanged: prev.status !== runStatus,
  };
}
