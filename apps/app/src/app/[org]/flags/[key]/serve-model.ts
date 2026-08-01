import type { FlagVariant, ProgressiveServe, Serve } from "@/lib/flags-api";

/**
 * The pure "serve" model shared by the rule editor: the percentage split a rule
 * (or the default) serves across a flag's variants, and the round-trip between
 * that editable split and the stored {@link Serve}. Kept dependency-free (types
 * only) so it's unit-testable without pulling in the client rule editor.
 *
 * Weights are the single source of truth. Exactly one variant at 100% stores as a
 * clean `{ variant }`; a real split stores as a `{ rollout }` bucketed on
 * `bucketBy` (blank = targetingKey). The same editor drives both.
 */

// Default bucketing identity. targetingKey is the OpenFeature-standard subject.
export const TARGETING_KEY = "targetingKey";

export type DurationUnit = "minutes" | "hours" | "days";
const UNIT_MS: Record<DurationUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};
/** A schedule step as edited (a number + a unit); the serve stores plain ms. */
export type ProgressiveStepDraft = { percent: number; value: number; unit: DurationUnit };
/** The editable form of a progressive (scheduled) rollout. `start` is epoch ms. */
export type ProgressiveDraft = {
  variant: string;
  fallback: string;
  bucketBy: string;
  start: number;
  steps: ProgressiveStepDraft[];
};

export function stepDurationMs(value: number, unit: DurationUnit): number {
  return Math.max(0, Math.round(value)) * UNIT_MS[unit];
}
/** Express a duration in ms as a clean {value, unit} for editing (largest even unit). */
function bestUnit(ms: number): { value: number; unit: DurationUnit } {
  for (const unit of ["days", "hours", "minutes"] as DurationUnit[]) {
    if (ms > 0 && ms % UNIT_MS[unit] === 0) return { value: ms / UNIT_MS[unit], unit };
  }
  return { value: Math.max(1, Math.round(ms / UNIT_MS.hours)), unit: "hours" };
}

export type ServeDraft = {
  weights: Record<string, number>;
  /** Attribute to bucket a split on; "" means targetingKey. */
  bucketBy: string;
  /** Variant served when a split's bucketBy attribute is absent; "" means none. */
  fallback?: string;
  /** When set, the serve is a progressive rollout (weights are ignored). */
  progressive?: ProgressiveDraft;
};

/**
 * A fresh progressive rollout: roll the second variant out over four steps
 * (5/10/25/60%, each 6h) matching Vercel's default schedule, else the first.
 */
export function defaultProgressive(variants: FlagVariant[], now: number): ProgressiveDraft {
  return {
    variant: variants[1]?.key ?? variants[0]?.key ?? "",
    fallback: variants[0]?.key ?? "",
    bucketBy: "",
    start: now,
    steps: [
      { percent: 5, value: 6, unit: "hours" },
      { percent: 10, value: 6, unit: "hours" },
      { percent: 25, value: 6, unit: "hours" },
      { percent: 60, value: 6, unit: "hours" },
    ],
  };
}

/** A fresh split: 100% to the first variant (i.e. a plain single-variant serve). */
export function defaultWeights(variants: FlagVariant[]): Record<string, number> {
  return Object.fromEntries(variants.map((v, i) => [v.key, i === 0 ? 100 : 0]));
}

/**
 * Scale the positive weights to total exactly 100 (integers). If none are
 * positive, fall back to an even split across all variants.
 */
export function balanceWeights(
  weights: Record<string, number>,
  variants: FlagVariant[],
): Record<string, number> {
  const positive = variants.filter((v) => (weights[v.key] ?? 0) > 0);
  const pool = positive.length > 0 ? positive : variants;
  const total = pool.reduce((sum, v) => sum + (weights[v.key] ?? 0), 0);
  const out: Record<string, number> = Object.fromEntries(
    variants.map((v) => [v.key, 0]),
  );
  let assigned = 0;
  for (const v of pool) {
    const share =
      positive.length > 0 && total > 0
        ? Math.round(((weights[v.key] ?? 0) / total) * 100)
        : Math.floor(100 / pool.length);
    out[v.key] = share;
    assigned += share;
  }
  // Hand any rounding remainder to the first slice so it totals exactly 100.
  const first = pool[0];
  if (first) out[first.key] += 100 - assigned;
  return out;
}

/** Project a stored serve into editable weights (+ bucketBy). */
export function parseServe(serve: unknown, variants: FlagVariant[]): ServeDraft {
  const weights: Record<string, number> = Object.fromEntries(
    variants.map((v) => [v.key, 0]),
  );
  if (serve && typeof serve === "object" && "progressive" in serve) {
    const p = (serve as { progressive: ProgressiveServe }).progressive;
    return {
      weights,
      bucketBy: "",
      progressive: {
        variant: p.variant,
        fallback: p.fallback,
        bucketBy: p.bucketBy ?? "",
        start: p.start,
        steps: (p.steps ?? []).map((s) => ({
          percent: s.percent,
          ...bestUnit(s.durationMs),
        })),
      },
    };
  }
  if (serve && typeof serve === "object" && "rollout" in serve) {
    const s = serve as {
      rollout: { variant: string; weight: number }[];
      bucketBy?: string;
      fallback?: string;
    };
    for (const r of s.rollout) weights[r.variant] = r.weight;
    return { weights, bucketBy: s.bucketBy ?? "", fallback: s.fallback ?? "" };
  }
  const variant =
    serve && typeof serve === "object" && "variant" in serve
      ? (serve as { variant: string }).variant
      : (variants[0]?.key ?? "");
  if (variant in weights) weights[variant] = 100;
  else if (variants[0]) weights[variants[0].key] = 100;
  return { weights, bucketBy: "" };
}

/**
 * Derive the stored Serve from the draft weights. Exactly one variant at 100%
 * collapses to a clean `{ variant }`; a real split becomes a `{ rollout }`
 * (bucketed on bucketBy, if any). Anything that doesn't total 100% is an error.
 */
export function buildServe(
  draft: ServeDraft,
  variants: FlagVariant[],
): { serve: Serve } | { error: string } {
  if (draft.progressive) {
    const p = draft.progressive;
    if (!p.variant) return { error: "choose a variant to roll out" };
    if (!p.fallback) return { error: "choose a fallback variant" };
    if (p.steps.length === 0) return { error: "add at least one rollout step" };
    const steps = p.steps.map((s) => ({
      percent: Math.max(0, Math.min(100, Math.round(s.percent))),
      durationMs: stepDurationMs(s.value, s.unit),
    }));
    if (steps.some((s) => s.durationMs <= 0)) return { error: "give every step a duration" };
    const bucketBy = p.bucketBy.trim();
    return {
      serve: {
        progressive: {
          variant: p.variant,
          fallback: p.fallback,
          start: p.start,
          steps,
          ...(bucketBy && bucketBy !== TARGETING_KEY ? { bucketBy } : {}),
        },
      },
    };
  }
  const positive = variants
    .map((v) => ({ variant: v.key, weight: draft.weights[v.key] ?? 0 }))
    .filter((r) => r.weight > 0);
  if (positive.length === 0) return { error: "give at least one variant a share" };
  const total = positive.reduce((sum, r) => sum + r.weight, 0);
  if (positive.length === 1 && total === 100) {
    return { serve: { variant: positive[0]!.variant } };
  }
  if (total !== 100) {
    return { error: `the split must total 100% (currently ${total}%)` };
  }
  const bucketBy = draft.bucketBy.trim();
  const usesBucketBy = Boolean(bucketBy) && bucketBy !== TARGETING_KEY;
  // Persist a fallback whenever it's a real variant so the round-trip is stable; the
  // engine only serves it when a custom bucketBy attribute is actually absent.
  const fallback = variants.some((v) => v.key === draft.fallback) ? draft.fallback : undefined;
  return {
    serve: {
      rollout: positive,
      ...(usesBucketBy ? { bucketBy } : {}),
      ...(fallback ? { fallback } : {}),
    },
  };
}

/** The Serve for a draft, or a best-effort single-variant fallback if incomplete. */
export function serveFromDraft(draft: ServeDraft, variants: FlagVariant[]): Serve {
  const s = buildServe(draft, variants);
  if (!("error" in s)) return s.serve;
  const first = variants.find((v) => (draft.weights[v.key] ?? 0) > 0) ?? variants[0];
  return { variant: first?.key ?? "" };
}

/** Field-level validation errors for a serve draft, for inline display + save gating. */
export type ServeErrors = {
  progressive?: {
    variant?: string;
    fallback?: string;
    steps?: ({ percent?: string; duration?: string } | undefined)[];
    form?: string;
  };
  split?: {
    weights?: Record<string, string>;
    total?: string;
    form?: string;
  };
};

const PERCENT_ERROR = "Must be between 0% and 100%";

function isBadPercent(n: number): boolean {
  return !Number.isFinite(n) || n < 0 || n > 100;
}

/**
 * Validate a serve draft to field-level errors (empty object = valid). One source
 * of truth for both the inline messages under each input and disabling Save.
 */
export function validateServe(draft: ServeDraft, variants: FlagVariant[]): ServeErrors {
  if (draft.progressive) {
    const p = draft.progressive;
    const prog: NonNullable<ServeErrors["progressive"]> = {};
    if (!p.variant) prog.variant = "Choose a variant";
    if (!p.fallback) prog.fallback = "Choose a variant";
    if (p.variant && p.fallback && p.variant === p.fallback) {
      prog.form = "Roll from and to must be different variants";
    }
    if (p.steps.length === 0) {
      prog.form = "Add at least one rollout step";
    } else {
      const steps = p.steps.map((s) => {
        const e: { percent?: string; duration?: string } = {};
        if (isBadPercent(s.percent)) e.percent = PERCENT_ERROR;
        if (!Number.isFinite(s.value) || s.value < 1) e.duration = "Must be at least 1";
        return e.percent || e.duration ? e : undefined;
      });
      if (steps.some(Boolean)) prog.steps = steps;
    }
    return Object.keys(prog).length ? { progressive: prog } : {};
  }

  const split: NonNullable<ServeErrors["split"]> = {};
  const weights: Record<string, string> = {};
  for (const v of variants) {
    const w = draft.weights[v.key] ?? 0;
    if (isBadPercent(w)) weights[v.key] = PERCENT_ERROR;
  }
  if (Object.keys(weights).length) split.weights = weights;
  const positive = variants.filter((v) => (draft.weights[v.key] ?? 0) > 0);
  if (positive.length === 0) {
    split.form = "Give at least one variant a share";
  } else if (positive.length > 1) {
    const total = positive.reduce((sum, v) => sum + (draft.weights[v.key] ?? 0), 0);
    if (total !== 100) split.total = `Must total 100% (currently ${total}%)`;
  }
  return Object.keys(split).length ? { split } : {};
}

/** Whether a ServeErrors carries any error. */
export function hasServeErrors(e: ServeErrors): boolean {
  return Boolean(e.progressive || e.split);
}
