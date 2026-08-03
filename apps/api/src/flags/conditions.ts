import type {
  EvaluationContext,
  JsonValue,
  Operator,
  Predicate,
  SegmentConfig,
} from "./types.js";

/**
 * Predicate evaluation for targeting rules and segments.
 *
 * A list of predicates is ANDed: they all must match. A predicate is either a
 * comparison on a context attribute (resolved by dotted path, so `user.plan`
 * reaches into a nested context) or a reference to a segment, whose own
 * predicates are then evaluated — with a cycle guard so a segment that
 * (transitively) references itself resolves to "no match" instead of looping.
 */
export function matchConditions(
  conditions: Predicate[],
  context: EvaluationContext,
  segments: Map<string, SegmentConfig>,
  seen: Set<string> = new Set(),
): boolean {
  return conditions.every((p) => matchPredicate(p, context, segments, seen));
}

function matchPredicate(
  predicate: Predicate,
  context: EvaluationContext,
  segments: Map<string, SegmentConfig>,
  seen: Set<string>,
): boolean {
  // Branches: AND / OR groups, nestable to any depth.
  if ("all" in predicate) {
    return predicate.all.every((p) => matchPredicate(p, context, segments, seen));
  }
  if ("any" in predicate) {
    return predicate.any.some((p) => matchPredicate(p, context, segments, seen));
  }

  // Leaf: segment reference (with cycle guard).
  if ("segment" in predicate) {
    if (seen.has(predicate.segment)) return false; // cycle
    const segment = segments.get(predicate.segment);
    if (!segment) return false;
    const nextSeen = new Set(seen).add(predicate.segment);
    return matchConditions(segment.conditions, context, segments, nextSeen);
  }

  // Leaf: attribute comparison.
  const actual = resolvePath(context, predicate.attribute);
  return applyOperator(predicate.op, actual, predicate.values ?? []);
}

/** Resolve a dotted attribute path into the context (undefined if absent). */
export function resolvePath(
  context: EvaluationContext,
  path: string,
): JsonValue | undefined {
  let current: unknown = context;
  for (const segment of path.split(".")) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as JsonValue | undefined;
}

function applyOperator(
  op: Operator,
  actual: JsonValue | undefined,
  values: JsonValue[],
): boolean {
  const first = values[0];

  switch (op) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
  }

  // Every remaining operator needs a present value to compare.
  if (actual === undefined || actual === null) return false;

  switch (op) {
    case "eq":
      return looseEquals(actual, first);
    case "neq":
      return !looseEquals(actual, first);
    case "in":
      return values.some((v) => looseEquals(actual, v));
    case "nin":
      return !values.some((v) => looseEquals(actual, v));
    case "contains":
      return asString(actual).includes(asString(first));
    case "not_contains":
      return !asString(actual).includes(asString(first));
    case "starts_with":
      return asString(actual).startsWith(asString(first));
    case "ends_with":
      return asString(actual).endsWith(asString(first));
    case "gt":
      return compareNumeric(actual, first, (a, b) => a > b);
    case "gte":
      return compareNumeric(actual, first, (a, b) => a >= b);
    case "lt":
      return compareNumeric(actual, first, (a, b) => a < b);
    case "lte":
      return compareNumeric(actual, first, (a, b) => a <= b);
    case "regex":
      return safeRegexTest(asString(first), asString(actual));
    case "before":
      return compareTime(actual, first, (a, b) => a < b);
    case "after":
      return compareTime(actual, first, (a, b) => a > b);
    case "semver_eq":
      return compareSemver(actual, first, (c) => c === 0);
    case "semver_gt":
      return compareSemver(actual, first, (c) => c > 0);
    case "semver_ge":
      return compareSemver(actual, first, (c) => c >= 0);
    case "semver_lt":
      return compareSemver(actual, first, (c) => c < 0);
    case "semver_le":
      return compareSemver(actual, first, (c) => c <= 0);
    default:
      return false;
  }
}

/** Deterministic JSON with object keys SORTED, so structural equality of objects and
 *  arrays doesn't depend on key insertion order ({a,b} equals {b,a}). */
function canonicalJson(v: JsonValue): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const obj = v as { [k: string]: JsonValue };
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k]!)}`).join(",")}}`;
}

/** Equality that treats "42" and 42 as equal, so context typing is forgiving. */
function looseEquals(a: JsonValue, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "object" || typeof b === "object") {
    return canonicalJson(a) === canonicalJson(b as JsonValue);
  }
  return String(a) === String(b);
}

function asString(v: JsonValue | undefined): string {
  return v == null ? "" : String(v);
}

function compareNumeric(
  a: JsonValue,
  b: JsonValue | undefined,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  return cmp(na, nb);
}

// A quantified group that itself contains an unbounded quantifier — the classic
// catastrophic-backtracking family `(a+)+`, `(a*)*`, `(.+)*`, etc. Matching such a
// pattern against a crafted input is exponential and would stall the eval event loop
// for every co-tenant on the instance, so we refuse to run it. Heuristic, not a proof:
// it catches the common nested-quantifier forms; a hard guarantee would need a
// linear-time engine (re2) or a per-eval timeout — a deliberate follow-up.
const NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)[+*]/;
const MAX_REGEX_PATTERN = 1000;
const MAX_REGEX_INPUT = 4000;

function safeRegexTest(pattern: string, input: string): boolean {
  // Bound the work per evaluation and refuse patterns/inputs that could hang the
  // hot path. A rule that can't be evaluated safely simply does not match (fail closed).
  if (
    pattern.length > MAX_REGEX_PATTERN ||
    input.length > MAX_REGEX_INPUT ||
    NESTED_QUANTIFIER.test(pattern)
  ) {
    return false;
  }
  try {
    return new RegExp(pattern).test(input);
  } catch {
    return false;
  }
}

/**
 * Compare two moments. Each side may be an epoch (number, or numeric string) or
 * any Date-parseable string (ISO). Unparseable input never matches — a targeting
 * rule should fail closed, not throw.
 */
function compareTime(
  a: JsonValue,
  b: JsonValue | undefined,
  cmp: (a: number, b: number) => boolean,
): boolean {
  const ta = toEpoch(a);
  const tb = toEpoch(b);
  if (ta === null || tb === null) return false;
  return cmp(ta, tb);
}

function toEpoch(v: JsonValue | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "") return null;
  // A bare integer string is treated as epoch milliseconds.
  if (/^-?\d+$/.test(s)) return Number(s);
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Compare two dotted numeric versions ("1.4.0" vs "1.10"). Returns via `cmp`
 * the sign of a-b, padding the shorter with zeros. Non-numeric segments make the
 * whole comparison fail (returns false) rather than guessing.
 */
function compareSemver(
  a: JsonValue,
  b: JsonValue | undefined,
  cmp: (sign: number) => boolean,
): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return false;
  const len = Math.max(va.length, vb.length);
  for (let i = 0; i < len; i++) {
    const diff = (va[i] ?? 0) - (vb[i] ?? 0);
    if (diff !== 0) return cmp(Math.sign(diff));
  }
  return cmp(0);
}

function parseVersion(v: JsonValue | undefined): number[] | null {
  if (v == null) return null;
  // Drop a leading "v" and any pre-release/build suffix (1.2.0-beta -> 1.2.0).
  const core = String(v)
    .trim()
    .replace(/^v/i, "")
    .split(/[-+]/)[0];
  if (core === "" || !/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split(".").map(Number);
}
