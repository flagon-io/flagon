import { bucket, rolloutSeed } from "../flags/bucket.js";
import type { EvaluationContext, EvaluationResult, FlagConfig } from "../flags/types.js";

/**
 * The PURE holdout logic: no database, no cache, no env — just deterministic
 * functions over a flag result and a holdout context. This is the experiments
 * layer's contribution to evaluation, kept dependency-light (only the flags
 * primitive's bucketing + types) so it is trivially testable and so the flags
 * primitive never has to know holdouts exist. The loading/caching lives next door
 * in holdout-overlay.ts.
 */
export type HoldoutOverlay = {
  /** Active holdouts in this environment: a deterministic % of units held out of
   *  experiments (served the flag's control). Empty for the common no-holdout case. */
  holdouts: { key: string; percentage: number }[];
  /** Keys of flags with a RUNNING experiment in this environment. A holdout only
   *  governs flags that are actually part of a running experiment. */
  experimentFlagKeys: Set<string>;
};

export const EMPTY_OVERLAY: HoldoutOverlay = { holdouts: [], experimentFlagKeys: new Set() };

/**
 * A unit is in a holdout when its deterministic bucket for that holdout falls under
 * the holdout's percentage. Same hashing as rollouts (keyed by the holdout so
 * different holdouts pick INDEPENDENT slices), so membership is stable per unit.
 */
export function inHoldout(
  holdouts: { key: string; percentage: number }[],
  context: EvaluationContext,
): boolean {
  const unit = context.targetingKey;
  if (unit === undefined || unit === null) return false;
  return holdouts.some(
    (h) =>
      h.percentage > 0 && bucket(rolloutSeed(`holdout:${h.key}`, unit)) < h.percentage / 100,
  );
}

/**
 * Enforce holdouts: on a flag that has a RUNNING experiment, a held-out unit is
 * served the flag's DEFAULT (control) variant with reason HOLDOUT, so the holdout
 * is a clean, experiment-free baseline. Flags with no experiment, disabled flags,
 * and errors pass through untouched, as do orgs with no active holdouts.
 */
export function applyHoldout(
  flag: FlagConfig,
  result: EvaluationResult,
  context: EvaluationContext,
  overlay: HoldoutOverlay = EMPTY_OVERLAY,
): EvaluationResult {
  if (overlay.holdouts.length === 0) return result;
  if (result.reason === "ERROR" || result.reason === "DISABLED") return result;
  if (!overlay.experimentFlagKeys.has(flag.key)) return result;
  if (!inHoldout(overlay.holdouts, context)) return result;
  const key = flag.defaultVariantKey ?? flag.offVariantKey;
  if (!key) return result;
  const variant = flag.variants.find((v) => v.key === key);
  if (!variant) return result;
  return { key: flag.key, value: variant.value, variant: variant.key, reason: "HOLDOUT" };
}
