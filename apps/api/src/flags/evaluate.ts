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

  // Resolve a Serve (variant or rollout) to a result, or null if a rollout is
  // degenerate (no positive weight) so the caller can fall through.
  const applyServe = (
    serve: Serve,
    variantReason: EvaluationReason,
  ): EvaluationResult | null => {
    if ("variant" in serve) return serveVariant(serve.variant, variantReason);
    if ("progressive" in serve) {
      return serveVariant(pickProgressive(serve.progressive, flag.key, context), "SPLIT");
    }
    const chosen = pickRollout(serve, flag.key, context);
    return chosen ? serveVariant(chosen, "SPLIT") : null;
  };

  // 1. Off in this environment.
  if (!flag.enabled) return serveVariant(flag.offVariantKey, "DISABLED");

  // 2. Targeting rules, lowest priority number first.
  const rules = [...flag.rules].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (!matchConditions(rule.conditions, context, segments)) continue;
    const result = applyServe(rule.serve, "TARGETING_MATCH");
    if (result) return result;
    // A misconfigured rollout (no weight) falls through to the default.
  }

  // 3. Default. STATIC when there was no targeting at all, else DEFAULT — and the
  // default may itself be a rollout (SPLIT). A degenerate default rollout falls
  // back to the single default variant.
  const variantReason: EvaluationReason =
    flag.rules.length === 0 ? "STATIC" : "DEFAULT";
  if (flag.defaultServe) {
    const result = applyServe(flag.defaultServe, variantReason);
    if (result) return result;
  }
  return serveVariant(flag.defaultVariantKey, variantReason);
}

/**
 * The percentage a progressive rollout is currently serving, from the elapsed time
 * since `start` against its stepped schedule. Before start → 0; within step i → its
 * percent; past the whole schedule → 100 (fully rolled out).
 */
function progressivePercent(
  p: Extract<Serve, { progressive: unknown }>["progressive"],
  now: number,
): number {
  const elapsed = now - p.start;
  if (elapsed < 0) return 0;
  let acc = 0;
  for (const step of p.steps) {
    acc += Math.max(0, step.durationMs);
    if (elapsed < acc) return Math.max(0, Math.min(100, step.percent));
  }
  return 100;
}

/**
 * Resolve a progressive rollout: compute the current percentage from the injected
 * clock, then bucket the subject — inside the percentage gets `variant`, the rest
 * `fallback`. Deterministic: same `$currentTime` + identity → same result.
 */
function pickProgressive(
  p: Extract<Serve, { progressive: unknown }>["progressive"],
  flagKey: string,
  context: EvaluationContext,
): string {
  const now = typeof context.$currentTime === "number" ? context.$currentTime : p.start;
  const percent = progressivePercent(p, now);
  if (percent <= 0) return p.fallback;
  if (percent >= 100) return p.variant;
  const identity = p.bucketBy ? resolvePath(context, p.bucketBy) : context.targetingKey;
  const point = bucket(rolloutSeed(flagKey, identity));
  return point < percent / 100 ? p.variant : p.fallback;
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
  // Can't bucket the subject (a custom bucketBy attribute is absent): serve the
  // explicit fallback rather than hashing every un-attributed subject to one slice.
  if (serve.bucketBy && (identity === undefined || identity === null) && serve.fallback) {
    return serve.fallback;
  }
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
