"use client";

import { Plus, X } from "lucide-react";
import { Input, Select } from "@flagon/design";
import type { Predicate, Segment } from "@/lib/flags-api";

/**
 * The shared targeting-condition builder. Both the flag rule editor and the
 * segment editor use this so their criteria, operators, value inputs, and the
 * stored predicate shape are IDENTICAL — parity by construction, not by copy.
 */

// Human labels for every operator the engine understands.
export const OP_LABELS: Record<string, string> = {
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

const STRING_OPS = [
  "eq",
  "neq",
  "in",
  "nin",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "exists",
  "not_exists",
];
const NUMBER_OPS = ["gt", "gte", "lt", "lte"];
// Semver comparison operators, offered on custom attributes for version
// targeting (whatever attribute the client passes their app version as).
const SEMVER_OPS = ["semver_gt", "semver_ge", "semver_lt", "semver_le"];
const TIME_OPS = ["after", "before"];

/**
 * The criteria catalog, OFREP-native. An OFREP evaluation context is just a
 * `targetingKey` plus arbitrary client-supplied attributes — there is NO standard
 * schema for email/country/device/etc. (those are SDK-specific things Statsig
 * collects; we don't). So we only surface what actually exists in the protocol:
 *
 *   - Custom attribute: any attribute the client chose to send, matched by name.
 *     This is the primary criterion; version targeting lives here too, since the
 *     app version is just whatever attribute they pass it as.
 *   - Targeting key: the OpenFeature-standard identity (`targetingKey`) every
 *     context carries and the value we bucket rollouts on.
 *   - Time: the reserved `$currentTime` WE inject and evaluate server-side.
 *   - In segment: a reference to one of our reusable segments.
 */
export type Criterion = {
  id: string;
  label: string;
  attribute?: string;
  kind?: "segment";
  input: "text" | "datetime";
  ops: string[];
};

export const CRITERIA: Criterion[] = [
  {
    id: "custom",
    label: "Custom attribute",
    input: "text",
    ops: [...STRING_OPS, ...NUMBER_OPS, ...SEMVER_OPS],
  },
  {
    id: "targetingKey",
    label: "Targeting key",
    attribute: "targetingKey",
    input: "text",
    ops: ["eq", "neq", "in", "nin", "contains", "starts_with", "ends_with"],
  },
  { id: "time", label: "Time", attribute: "$currentTime", input: "datetime", ops: TIME_OPS },
  { id: "segment", label: "In segment", kind: "segment", input: "text", ops: [] },
];

export const criterionById = (id: string) =>
  CRITERIA.find((c) => c.id === id) ?? CRITERIA[0];

export type CondDraft = {
  criterion: string;
  /** Only meaningful when criterion === "custom". */
  attribute: string;
  op: string;
  value: string;
  segment: string;
};

export const emptyCond = (segments: Segment[]): CondDraft => ({
  criterion: "custom",
  attribute: "",
  op: "eq",
  value: "",
  segment: segments[0]?.key ?? "",
});

/** ISO string -> the `datetime-local` input's "YYYY-MM-DDTHH:mm" (local time). */
function isoToLocalInput(v: unknown): string {
  if (typeof v !== "string") return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** Project a stored predicate back into an editable condition row (null if it's
 * an AND/OR group the flat builder can't show). */
export function fromPredicate(p: Predicate): CondDraft | null {
  if ("all" in p || "any" in p) return null;
  if ("segment" in p) {
    return { criterion: "segment", attribute: "", op: "", value: "", segment: p.segment };
  }
  // Prefer a named criterion whose attribute AND operator set match; otherwise
  // fall back to "custom", which keeps the raw attribute and broadest operators.
  const named = CRITERIA.find(
    (c) => c.id !== "custom" && c.attribute === p.attribute && c.ops.includes(p.op),
  );
  const criterion = named?.id ?? "custom";
  const crit = criterionById(criterion);
  const vals = p.values ?? [];
  let value = "";
  if (crit.input === "datetime") value = isoToLocalInput(vals[0]);
  else if (p.op === "in" || p.op === "nin") value = vals.map(String).join(", ");
  else value = vals[0] != null ? String(vals[0]) : "";
  return {
    criterion,
    attribute: criterion === "custom" ? p.attribute : "",
    op: p.op,
    value,
    segment: "",
  };
}

/** Build the stored `conditions` array from the editable rows (or an error). */
export function buildConditions(
  conds: CondDraft[],
): { conditions: Predicate[] } | { error: string } {
  const predicates: Predicate[] = [];
  for (const c of conds) {
    const crit = criterionById(c.criterion);

    if (crit.kind === "segment") {
      if (!c.segment) return { error: "pick a segment for each condition" };
      predicates.push({ segment: c.segment });
      continue;
    }

    const attribute = crit.attribute ?? c.attribute.trim();
    if (!attribute) return { error: "enter an attribute for each condition" };

    if (c.op === "exists" || c.op === "not_exists") {
      predicates.push({ attribute, op: c.op, values: [] });
      continue;
    }

    if (crit.input === "datetime") {
      if (!c.value) return { error: "pick a date and time for each time condition" };
      const at = new Date(c.value);
      if (Number.isNaN(at.getTime())) return { error: "that date and time is not valid" };
      predicates.push({ attribute, op: c.op, values: [at.toISOString()] });
      continue;
    }

    if (c.op === "in" || c.op === "nin") {
      const values = c.value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (values.length === 0) return { error: "enter at least one value" };
      predicates.push({ attribute, op: c.op, values });
      continue;
    }

    if (!c.value.trim()) return { error: "enter a value for each condition" };
    predicates.push({ attribute, op: c.op, values: [c.value.trim()] });
  }
  return { conditions: predicates };
}

export function formatCondValue(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
    }
  }
  return String(v);
}

export function describePredicate(p: Predicate): string {
  if ("all" in p) return `(${p.all.map(describePredicate).join(" and ")})`;
  if ("any" in p) return `(${p.any.map(describePredicate).join(" or ")})`;
  if ("segment" in p) return `in segment "${p.segment}"`;
  const op = OP_LABELS[p.op] ?? p.op;
  const attr = p.attribute === "$currentTime" ? "current time" : p.attribute;
  const val = p.values && p.values.length ? ` ${p.values.map(formatCondValue).join(", ")}` : "";
  return `${attr} ${op}${val}`;
}

/**
 * The row editor: an ordered list of conditions, each a criterion + operator +
 * (adaptive) value. `leadWord` labels the first/subsequent rows — "If/And" for
 * flag rules, "" for segments (which show their own AND/OR chip via `joiner`).
 */
export function ConditionRows({
  conds,
  setConds,
  segments,
  joiner,
  leadWord = "If",
}: {
  conds: CondDraft[];
  setConds: (updater: (prev: CondDraft[]) => CondDraft[]) => void;
  segments: Segment[];
  /** The word shown before rows after the first (e.g. "And", "Or"). */
  joiner: string;
  /** The word shown before the first row ("If" for flag rules; "" for segments). */
  leadWord?: string;
}) {
  const setCond = (i: number, patch: Partial<CondDraft>) =>
    setConds((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // Switching criterion resets the operator to the first valid one and clears
  // the value, so you never end up with, say, a "newer than" op on an Email.
  const setCriterion = (i: number, id: string) => {
    const crit = criterionById(id);
    setConds((prev) =>
      prev.map((c, j) =>
        j === i ? { ...c, criterion: id, op: crit.ops[0] ?? c.op, value: "" } : c,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {conds.map((c, i) => {
        const crit = criterionById(c.criterion);
        const isSegment = crit.kind === "segment";
        const needsValue = !isSegment && c.op !== "exists" && c.op !== "not_exists";
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-9 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {i === 0 ? leadWord : joiner}
            </span>
            <Select
              value={c.criterion}
              onValueChange={(v) => setCriterion(i, v)}
              ariaLabel="Criteria"
              className="w-40 shrink-0"
              options={CRITERIA.map((x) => ({ value: x.id, label: x.label }))}
            />
            {crit.id === "custom" ? (
              <Input
                value={c.attribute}
                onChange={(e) => setCond(i, { attribute: e.target.value })}
                placeholder="attribute"
                aria-label="Attribute"
                className="min-w-0 flex-1 font-mono"
              />
            ) : null}
            {isSegment ? (
              segments.length === 0 ? (
                <span className="flex-1 text-xs text-zinc-500">No segments yet</span>
              ) : (
                <Select
                  value={c.segment}
                  onValueChange={(v) => setCond(i, { segment: v })}
                  ariaLabel="Segment"
                  className="min-w-0 flex-1"
                  options={segments.map((s) => ({ value: s.key, label: s.name }))}
                />
              )
            ) : (
              <>
                <Select
                  value={c.op}
                  onValueChange={(v) => setCond(i, { op: v })}
                  ariaLabel="Operator"
                  className="shrink-0"
                  options={crit.ops.map((op) => ({ value: op, label: OP_LABELS[op] ?? op }))}
                />
                {needsValue ? (
                  crit.input === "datetime" ? (
                    <Input
                      type="datetime-local"
                      value={c.value}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                      aria-label="Value"
                      className="min-w-0 flex-1"
                    />
                  ) : (
                    <Input
                      value={c.value}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                      placeholder={
                        c.op === "in" || c.op === "nin" ? "value 1, value 2, …" : "value"
                      }
                      aria-label="Value"
                      className="min-w-0 flex-1 font-mono"
                    />
                  )
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={() => setConds((prev) => prev.filter((_, j) => j !== i))}
              disabled={conds.length === 1}
              title="Remove condition"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400 disabled:opacity-30"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => setConds((prev) => [...prev, emptyCond(segments)])}
        className="mt-0.5 inline-flex w-fit items-center gap-1.5 pl-11 text-sm text-zinc-400 hover:text-zinc-200"
      >
        <Plus className="h-4 w-4" /> Add condition
      </button>
    </div>
  );
}
