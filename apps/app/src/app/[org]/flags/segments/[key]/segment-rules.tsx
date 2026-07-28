"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@flagon/design";
import { Button } from "@flagon/design";
import { updateSegmentAction } from "../../actions";
import {
  buildConditions,
  ConditionRows,
  fromPredicate,
  type CondDraft,
} from "../../condition-builder";
import type { Predicate, Segment } from "@/lib/flags-api";

// A single top-level ANY group means OR; anything else is treated as AND.
function initialState(conditions: Predicate[]): {
  combinator: "all" | "any";
  leaves: Predicate[];
} {
  if (conditions.length === 1 && "any" in conditions[0]) {
    return { combinator: "any", leaves: conditions[0].any };
  }
  return { combinator: "all", leaves: conditions };
}

export function SegmentRules({
  slug,
  segment,
  segments,
}: {
  slug: string;
  segment: Segment;
  /** Other segments this one can reference (excludes itself). */
  segments: Segment[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const init = initialState(segment.conditions);
  const [combinator, setCombinator] = useState<"all" | "any">(init.combinator);
  const [conds, setConds] = useState<CondDraft[]>(
    init.leaves.map(fromPredicate).filter((c): c is CondDraft => c !== null),
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing anything (rows or combinator) marks the section dirty.
  const editConds = (updater: (prev: CondDraft[]) => CondDraft[]) => {
    setConds(updater);
    setDirty(true);
  };

  function save() {
    setError(null);
    if (conds.length === 0) return setError("Add at least one filter.");
    const built = buildConditions(conds);
    if ("error" in built) return setError(`Please ${built.error}.`);
    // AND is a flat list; OR wraps the leaves in a single `any` group.
    const conditions: Predicate[] =
      combinator === "any" && built.conditions.length > 0
        ? [{ any: built.conditions }]
        : built.conditions;
    start(async () => {
      const res = await updateSegmentAction(slug, segment.key, { conditions });
      if (res.error) return setError(res.error);
      setDirty(false);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-zinc-400">
        <span>Match</span>
        <SegmentedControl
          value={combinator}
          onValueChange={(v) => {
            setCombinator(v as "all" | "any");
            setDirty(true);
          }}
          ariaLabel="Combinator"
          className="w-auto"
          options={[
            { value: "all", label: "ALL" },
            { value: "any", label: "ANY" },
          ]}
        />
        <span>of the following</span>
      </div>

      {conds.length === 0 ? (
        <p className="mb-2 text-sm text-zinc-500">
          No filters yet. Add one to define who belongs to this segment.
        </p>
      ) : null}

      <ConditionRows
        conds={conds}
        setConds={editConds}
        segments={segments}
        joiner={combinator === "any" ? "Or" : "And"}
        leadWord=""
      />

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      {dirty ? (
        <div className="mt-4 flex items-center gap-2 border-t border-white/8 pt-4">
          <Button variant="primary" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          <span className="text-xs text-zinc-500">Unsaved changes</span>
        </div>
      ) : null}
    </div>
  );
}
