/**
 * Targeting evaluation - pure boolean logic over an EvaluationContext.
 *
 * Conditions form a small tree (no string eval, no regex injection) so the same
 * structure ports cleanly to Go. Segments are named conditions resolved by ref.
 */

import type { Condition, EvaluationContext, JsonValue } from './types';

/** Evaluate a condition tree against a context. Unknown attributes => false. */
export function matches(
  condition: Condition,
  ctx: EvaluationContext,
  segments: Record<string, Condition>,
  // Guards against cyclic segment references.
  seen: Set<string> = new Set(),
): boolean {
  switch (condition.op) {
    case 'true':
      return true;
    case 'all':
      return condition.of.every((c) => matches(c, ctx, segments, seen));
    case 'any':
      return condition.of.some((c) => matches(c, ctx, segments, seen));
    case 'not':
      return !matches(condition.of, ctx, segments, seen);
    case 'segment': {
      if (seen.has(condition.ref)) return false; // cycle
      const seg = segments[condition.ref];
      if (!seg) return false;
      return matches(seg, ctx, segments, new Set(seen).add(condition.ref));
    }
    case 'eq':
      return jsonEquals(ctx[condition.attr], condition.value);
    case 'ne':
      return !jsonEquals(ctx[condition.attr], condition.value);
    case 'in':
      return condition.values.some((v) => jsonEquals(ctx[condition.attr], v));
    case 'nin':
      return !condition.values.some((v) => jsonEquals(ctx[condition.attr], v));
    case 'contains':
      return asString(ctx[condition.attr])?.includes(condition.value) ?? false;
    case 'starts_with':
      return asString(ctx[condition.attr])?.startsWith(condition.value) ?? false;
    case 'ends_with':
      return asString(ctx[condition.attr])?.endsWith(condition.value) ?? false;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const n = asNumber(ctx[condition.attr]);
      if (n === undefined) return false;
      if (condition.op === 'gt') return n > condition.value;
      if (condition.op === 'gte') return n >= condition.value;
      if (condition.op === 'lt') return n < condition.value;
      return n <= condition.value;
    }
    case 'semver': {
      const actual = asString(ctx[condition.attr]);
      if (actual === undefined) return false;
      const cmp = compareSemver(actual, condition.value);
      if (cmp === undefined) return false;
      switch (condition.cmp) {
        case '=':
          return cmp === 0;
        case '>':
          return cmp > 0;
        case '>=':
          return cmp >= 0;
        case '<':
          return cmp < 0;
        case '<=':
          return cmp <= 0;
      }
    }
  }
}

function asString(v: JsonValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: JsonValue | undefined): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

/** Structural equality for JSON primitives (and shallow arrays/objects). */
function jsonEquals(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

/**
 * Compare two semantic versions. Returns -1 | 0 | 1, or undefined if either
 * side is not a parseable `MAJOR.MINOR.PATCH` (pre-release tags ignored).
 */
export function compareSemver(a: string, b: string): number | undefined {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return undefined;
  for (let i = 0; i < 3; i++) {
    if (pa[i]! < pb[i]!) return -1;
    if (pa[i]! > pb[i]!) return 1;
  }
  return 0;
}

function parseSemver(v: string): [number, number, number] | undefined {
  const core = v.trim().replace(/^v/, '').split('+')[0]!.split('-')[0]!;
  const parts = core.split('.');
  if (parts.length === 0 || parts.length > 3) return undefined;
  const nums = [0, 0, 0];
  for (let i = 0; i < parts.length; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0) return undefined;
    nums[i] = n;
  }
  return nums as [number, number, number];
}
