import type { Predicate, Serve } from "./types.js";

/**
 * Human-readable descriptions of targeting, used to record WHAT changed in a
 * flag revision (not just that something did). Kept deliberately close to the
 * console's own phrasing so the audit log reads the way the UI does.
 */
const OP_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  in: "is any of",
  nin: "is none of",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  exists: "exists",
  not_exists: "does not exist",
  before: "before",
  after: "after",
  semver_eq: "equals",
  semver_gt: "newer than",
  semver_ge: "at or newer than",
  semver_lt: "older than",
  semver_le: "at or older than",
};

function describePredicate(p: Predicate): string {
  if ("all" in p) return `(${p.all.map(describePredicate).join(" and ")})`;
  if ("any" in p) return `(${p.any.map(describePredicate).join(" or ")})`;
  if ("segment" in p) return `in segment "${p.segment}"`;
  const op = OP_LABELS[p.op] ?? p.op;
  const attr = p.attribute === "$currentTime" ? "current time" : p.attribute;
  const val = p.values && p.values.length ? ` ${p.values.join(", ")}` : "";
  return `${attr} ${op}${val}`;
}

export function describeServe(serve: Serve, label: (key: string) => string): string {
  if ("rollout" in serve) {
    const split = serve.rollout.map((r) => `${label(r.variant)} ${r.weight}%`).join(", ");
    return serve.fallback ? `${split} (else ${label(serve.fallback)})` : split;
  }
  if ("progressive" in serve) {
    return `${label(serve.progressive.variant)} (progressive rollout, else ${label(serve.progressive.fallback)})`;
  }
  return label(serve.variant);
}

/** e.g. `if email ends with @flagon.io, serve On`. */
export function describeRule(
  conditions: Predicate[],
  serve: Serve,
  label: (key: string) => string,
): string {
  const cond = conditions.map(describePredicate).join(" and ");
  const served = describeServe(serve, label);
  return cond ? `if ${cond}, serve ${served}` : `serve ${served}`;
}

/**
 * Diff two ordered rule lists (already rendered to text) into change lines:
 * what was added, removed, or (if only the sequence moved) reordered.
 */
export function diffRuleDescriptions(before: string[], after: string[]): string[] {
  const changes: string[] = [];
  const remaining = [...before];
  for (const line of after) {
    const at = remaining.indexOf(line);
    if (at === -1) changes.push(`Added rule: ${line}`);
    else remaining.splice(at, 1);
  }
  for (const line of remaining) changes.push(`Removed rule: ${line}`);
  // No adds or removes, but the order differs -> it was a reorder.
  if (changes.length === 0 && before.join("|") !== after.join("|")) {
    changes.push("Reordered targeting rules");
  }
  return changes;
}
