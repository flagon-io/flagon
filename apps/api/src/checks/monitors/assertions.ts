import { z } from "zod";
import type { Assertion } from "./types.js";

/**
 * The assertion engine shared by the HTTP-based monitors (URL, API, later Multistep).
 * An assertion is a `source` (what to read from the response) + a `comparison` + a
 * `target`, mirroring Checkly's Source / Property / Comparison / Target model. Status
 * code is just ONE source among many — deliberately NOT conflated with a single
 * "expected status" field. Evaluation is pure and returns per-assertion results for the
 * run detail view.
 */

export const ASSERTION_SOURCES = ["status", "responseTime", "body", "jsonBody", "header"] as const;
export type AssertionSource = (typeof ASSERTION_SOURCES)[number];

export const ASSERTION_COMPARISONS = [
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "contains",
  "not_contains",
  "is_empty",
  "not_empty",
] as const;
export type AssertionComparison = (typeof ASSERTION_COMPARISONS)[number];

export const assertionSchema = z.object({
  source: z.enum(ASSERTION_SOURCES),
  /** For `header`: the header name. For `jsonBody`: a dot path (e.g. `data.id`). */
  property: z.string().optional(),
  comparison: z.enum(ASSERTION_COMPARISONS),
  /** The value to compare against. Ignored for is_empty / not_empty. */
  target: z.string().optional(),
});
export type AssertionSpec = z.infer<typeof assertionSchema>;

/** The default assertion for an HTTP check: succeed on any non-error status. */
export const DEFAULT_HTTP_ASSERTIONS: AssertionSpec[] = [
  { source: "status", comparison: "less_than", target: "400" },
];

/** Whether any assertion reads the response body (so the runner knows to buffer it). */
export function needsBody(assertions: AssertionSpec[]): boolean {
  return assertions.some((a) => a.source === "body" || a.source === "jsonBody");
}

export type ResponseFacts = {
  status: number;
  responseTimeMs: number;
  bodyText: string;
  header: (name: string) => string | null;
};

/** Read a value from a parsed-JSON body by a simple dot path (`a.b.0.c`). */
function jsonAt(bodyText: string, path: string): string {
  let node: unknown;
  try {
    node = JSON.parse(bodyText);
  } catch {
    return "";
  }
  for (const key of path.split(".").filter(Boolean)) {
    if (node == null) return "";
    node = (node as Record<string, unknown>)[key];
  }
  if (node == null) return "";
  return typeof node === "object" ? JSON.stringify(node) : String(node);
}

function actualFor(a: AssertionSpec, facts: ResponseFacts): string {
  switch (a.source) {
    case "status":
      return String(facts.status);
    case "responseTime":
      return String(facts.responseTimeMs);
    case "body":
      return facts.bodyText;
    case "header":
      return facts.header(a.property ?? "") ?? "";
    case "jsonBody":
      return jsonAt(facts.bodyText, a.property ?? "");
  }
}

function compare(comparison: AssertionComparison, actual: string, target: string): boolean {
  switch (comparison) {
    case "equals":
      return actual === target;
    case "not_equals":
      return actual !== target;
    case "greater_than":
      return Number(actual) > Number(target);
    case "less_than":
      return Number(actual) < Number(target);
    case "contains":
      return actual.includes(target);
    case "not_contains":
      return !actual.includes(target);
    case "is_empty":
      return actual === "";
    case "not_empty":
      return actual !== "";
  }
}

const COMPARISON_LABELS: Record<AssertionComparison, string> = {
  equals: "equals",
  not_equals: "not equals",
  greater_than: ">",
  less_than: "<",
  contains: "contains",
  not_contains: "not contains",
  is_empty: "is empty",
  not_empty: "not empty",
};

/** Evaluate every assertion against the response facts; returns per-assertion results. */
export function evaluateAssertions(assertions: AssertionSpec[], facts: ResponseFacts): Assertion[] {
  return assertions.map((a) => {
    const actual = actualFor(a, facts);
    const ok = compare(a.comparison, actual, a.target ?? "");
    const label = a.property ? `${a.source}(${a.property})` : a.source;
    const needsTarget = a.comparison !== "is_empty" && a.comparison !== "not_empty";
    return {
      source: label,
      ok,
      expected: `${COMPARISON_LABELS[a.comparison]}${needsTarget ? ` ${a.target ?? ""}` : ""}`.trim(),
      actual: actual.length > 120 ? `${actual.slice(0, 120)}…` : actual,
    };
  });
}
