import { bucket, rolloutSeed } from "./bucket.js";
import { matchConditions, resolvePath } from "./conditions.js";
import type {
  EvaluationContext,
  EvaluationReason,
  EvaluationResult,
  FlagConfig,
  Serve,
  SegmentConfig,
} from "./types.js";

/**
 * The evaluation core. Pure: given a flag's fully-loaded config, the caller's
 * context, and the segment lookup, it returns the OFREP-shaped result. No I/O,
 * no clock, no randomness beyond deterministic bucketing — so it is exhaustively
 * unit-testable and identical every time for the same inputs.
 *
 * Order of resolution:
 *   1. Disabled in this environment  -> serve the "off" variant   (DISABLED)
 *   2. First targeting rule that matches, by priority:
 *        - serve a fixed variant                                  (TARGETING_MATCH)
 *        - or a weighted rollout, bucketed by identity            (SPLIT)
 *   3. Nothing matched                -> serve the default variant (DEFAULT/STATIC)
 */
export function evaluate(
  flag: FlagConfig,
  context: EvaluationContext,
  segments: Map<string, SegmentConfig>,
): EvaluationResult {
  const byKey = new Map(flag.variants.map((v) => [v.key, v]));

  const serveVariant = (
    key: string | null,
    reason: EvaluationReason,
  ): EvaluationResult => {
    if (!key) {
      return errorResult(flag.key, "GENERAL", "no variant configured to serve");
    }
    const variant = byKey.get(key);
    if (!variant) {
      return errorResult(
        flag.key,
        "GENERAL",
        `configured variant "${key}" does not exist`,
      );
    }
    return { key: flag.key, value: variant.value, variant: variant.key, reason };
  };

  // 1. Off in this environment.
  if (!flag.enabled) return serveVariant(flag.offVariantKey, "DISABLED");

  // 2. Targeting rules, lowest priority number first.
  const rules = [...flag.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (!matchConditions(rule.conditions, context, segments)) continue;

    if ("variant" in rule.serve) {
      return serveVariant(rule.serve.variant, "TARGETING_MATCH");
    }
    const chosen = pickRollout(rule.serve, flag.key, context);
    if (chosen) return serveVariant(chosen, "SPLIT");
    // A misconfigured rollout (no weight) falls through to the default.
  }

  // 3. Default. STATIC when there was no targeting at all, else DEFAULT.
  return serveVariant(
    flag.defaultVariantKey,
    flag.rules.length === 0 ? "STATIC" : "DEFAULT",
  );
}

/** Choose a variant from a weighted rollout, deterministically by identity. */
function pickRollout(
  serve: Extract<Serve, { rollout: unknown }>,
  flagKey: string,
  context: EvaluationContext,
): string | null {
  const total = serve.rollout.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return null;

  const identity = serve.bucketBy
    ? resolvePath(context, serve.bucketBy)
    : context.targetingKey;
  const point = bucket(rolloutSeed(flagKey, identity));

  let cumulative = 0;
  for (const entry of serve.rollout) {
    cumulative += Math.max(0, entry.weight) / total;
    if (point < cumulative) return entry.variant;
  }
  // Floating-point tail: hand the last slice the remainder.
  return serve.rollout[serve.rollout.length - 1]?.variant ?? null;
}

function errorResult(
  key: string,
  errorCode: string,
  errorDetails: string,
): EvaluationResult {
  return { key, value: null, reason: "ERROR", errorCode, errorDetails };
}
