/**
 * The evaluation engine. Pure: (Bundle, flagKey, context) -> EvaluationResult.
 *
 * This is the single source of truth for evaluation semantics. The Go data
 * plane must mirror this file exactly; the shared fixtures in evaluate.test.ts
 * are the cross-language conformance guard.
 */

import { bucket } from './hash';
import { matches } from './targeting';
import type {
  Bundle,
  EvaluationContext,
  EvaluationResult,
  FlagDefinition,
  Outcome,
} from './types';

/** Evaluate a single flag by key. Never throws — failures map to error results. */
export function evaluateFlag(
  bundle: Bundle,
  key: string,
  ctx: EvaluationContext,
): EvaluationResult {
  const flag = bundle.flags[key];
  if (!flag) {
    return {
      key,
      value: null,
      reason: 'ERROR',
      errorCode: 'FLAG_NOT_FOUND',
      errorDetails: `flag "${key}" not found`,
    };
  }

  // Disabled flags resolve to the default variant with reason DISABLED.
  if (flag.state === 'DISABLED') {
    return resolveVariant(key, flag, flag.defaultVariant, 'DISABLED');
  }

  // First matching rule wins.
  for (const rule of flag.targeting ?? []) {
    if (matches(rule.when, ctx, bundle.segments)) {
      return resolveOutcome(key, flag, rule.then, ctx);
    }
  }

  // No rule matched -> default.
  return resolveVariant(key, flag, flag.defaultVariant, 'DEFAULT');
}

/** Evaluate every flag in the bundle (OFREP bulk evaluation). */
export function evaluateAll(bundle: Bundle, ctx: EvaluationContext): EvaluationResult[] {
  return Object.keys(bundle.flags).map((key) => evaluateFlag(bundle, key, ctx));
}

function resolveOutcome(
  key: string,
  flag: FlagDefinition,
  outcome: Outcome,
  ctx: EvaluationContext,
): EvaluationResult {
  if ('variant' in outcome) {
    return resolveVariant(key, flag, outcome.variant, 'TARGETING_MATCH');
  }

  // Weighted split. Bucket the subject deterministically.
  const bucketAttr = outcome.bucketBy ?? 'targetingKey';
  const subject = String(ctx[bucketAttr] ?? ctx.targetingKey ?? '');
  const total = outcome.fractional.reduce((sum, f) => sum + Math.max(0, f.weight), 0);
  if (total <= 0) {
    return resolveVariant(key, flag, flag.defaultVariant, 'DEFAULT');
  }

  // Map the [0,10000) bucket into the cumulative weight space.
  const point = (bucket(key, subject) / 10000) * total;
  let cumulative = 0;
  for (const slice of outcome.fractional) {
    cumulative += Math.max(0, slice.weight);
    if (point < cumulative) {
      return resolveVariant(key, flag, slice.variant, 'SPLIT');
    }
  }
  // Floating-point edge: fall to the last slice.
  const last = outcome.fractional[outcome.fractional.length - 1]!;
  return resolveVariant(key, flag, last.variant, 'SPLIT');
}

function resolveVariant(
  key: string,
  flag: FlagDefinition,
  variant: string,
  reason: EvaluationResult['reason'],
): EvaluationResult {
  if (!(variant in flag.variants)) {
    return {
      key,
      value: null,
      reason: 'ERROR',
      errorCode: 'PARSE_ERROR',
      errorDetails: `variant "${variant}" is not defined on flag "${key}"`,
    };
  }
  return { key, value: flag.variants[variant]!, reason, variant };
}
