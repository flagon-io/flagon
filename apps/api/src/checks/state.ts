import type { Check } from "../db/schema.js";

/**
 * The check state machine — the hysteresis that turns a noisy stream of probe results
 * into a small number of trustworthy transitions. This is Layer 1 of the failure
 * gradient (see CHECKS_DESIGN.md): it answers "is this real?", NOT "who do we page".
 *
 *   up ──fail (< failure_threshold)──▶ degraded ──fail (reach threshold)──▶ down  [fire to_down]
 *   down ──success (< recovery_threshold)──▶ degraded ──success (reach threshold)──▶ up  [fire to_up]
 *
 * A single bad probe from `up` only reaches `degraded` (recorded, NOT alerted). Actions
 * fire ONLY on a transition, exactly once. Recovery is asymmetric (needs
 * recovery_threshold consecutive successes) so a flapping endpoint can't open/close
 * incidents every minute.
 */

export type CheckStatus = "unknown" | "up" | "degraded" | "down" | "paused";
export type Transition = "to_down" | "to_up" | null;

export type StateUpdate = {
  status: CheckStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  transition: Transition;
};

export function nextState(check: Check, ok: boolean): StateUpdate {
  const wasDown = check.status === "down";
  const consecutiveFailures = ok ? 0 : check.consecutiveFailures + 1;
  const consecutiveSuccesses = ok ? check.consecutiveSuccesses + 1 : 0;
  let status: CheckStatus = check.status as CheckStatus;
  let transition: Transition = null;

  if (ok) {
    if (wasDown) {
      // Recovering: hold at degraded until we clear the recovery threshold.
      if (consecutiveSuccesses >= check.recoveryThreshold) {
        status = "up";
        transition = "to_up";
      } else {
        status = "degraded";
      }
    } else {
      // A success from up/degraded/unknown clears a blip immediately.
      status = "up";
    }
  } else {
    if (wasDown) {
      status = "down";
    } else if (consecutiveFailures >= check.failureThreshold) {
      status = "down";
      transition = "to_down";
    } else {
      // Pending down: one (or a few) bad probes, not yet confirmed. No alert.
      status = "degraded";
    }
  }

  return { status, consecutiveFailures, consecutiveSuccesses, transition };
}
