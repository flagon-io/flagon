"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Crosshair, Plus, Trash2 } from "lucide-react";
import { Button, Input, Select, Switch } from "@flagon/design";
import {
  saveRulesAction,
  setDefaultVariantAction,
  toggleFlagEnvAction,
} from "../actions";
import {
  buildConditions,
  ConditionRows,
  describePredicate,
  emptyCond,
  fromPredicate,
  type CondDraft,
} from "../condition-builder";
import type { FlagEnvConfig, FlagVariant, Predicate, Segment, Serve } from "@/lib/flags-api";

export function EnvCard({
  slug,
  flagKey,
  env,
  variants,
  segments,
  isBoolean,
  readOnly = false,
}: {
  slug: string;
  flagKey: string;
  env: FlagEnvConfig;
  variants: FlagVariant[];
  segments: Segment[];
  isBoolean: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(env.enabled);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variantLabel = (key: string | null) =>
    key ? (variants.find((v) => v.key === key)?.label || key) : "—";

  function setOn(next: boolean) {
    setEnabled(next);
    setError(null);
    start(async () => {
      const res = await toggleFlagEnvAction(slug, flagKey, env.key, next);
      if (res.error) {
        setEnabled(!next);
        setError(res.error);
      } else router.refresh();
    });
  }

  function setDefault(variantKey: string) {
    setError(null);
    start(async () => {
      const res = await setDefaultVariantAction(slug, flagKey, env.key, variantKey);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/2">
      <div className="flex items-center justify-between gap-4 p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <div>
            <p className="font-medium text-zinc-100">{env.name}</p>
            <p className="text-xs text-zinc-500">
              {env.rules.length === 0
                ? "No targeting rules"
                : `${env.rules.length} targeting rule${env.rules.length > 1 ? "s" : ""}`}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-3">
          {!isBoolean ? (
            <Select
              value={env.defaultVariantKey ?? ""}
              onValueChange={setDefault}
              disabled={pending || readOnly}
              ariaLabel="Default variant"
              options={variants.map((v) => ({
                value: v.key,
                label: v.label || String(v.value),
              }))}
            />
          ) : null}
          <div className="flex items-center gap-2.5">
            <span
              className={`text-xs font-medium ${enabled ? "text-teal-400" : "text-zinc-500"}`}
            >
              {enabled ? "On" : "Off"}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={setOn}
              disabled={pending || readOnly}
              ariaLabel={`${env.name} enabled`}
            />
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/6 p-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <Crosshair className="h-3.5 w-3.5" /> Targeting rules
          </div>
          <RulesEditor
            slug={slug}
            flagKey={flagKey}
            envKey={env.key}
            rules={env.rules}
            variants={variants}
            segments={segments}
            defaultLabel={variantLabel(env.defaultVariantKey)}
            readOnly={readOnly}
            onSaved={() => router.refresh()}
          />
        </div>
      ) : null}

      {error ? <p className="px-4 pb-3 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

// A sentinel value in the Serve select that switches to a weighted rollout —
// an option in the existing control, not a separate toggle.
const ROLLOUT = "__rollout__";

type RuleDraft = {
  /** Stable local key for React + edits. */
  uid: string;
  conds: CondDraft[];
  /** A variant key, or ROLLOUT for a weighted split. */
  serveVariant: string;
  weights: Record<string, number>;
  /**
   * Set when a stored rule uses nested AND/OR groups the flat builder can't
   * represent. We keep the raw conditions and render the rule read-only so an
   * edit elsewhere never silently drops the advanced logic.
   */
  raw?: Predicate[];
};

// Stable-across-renders id source for newly added rules (no Date/random, so
// server and client first render agree).
let ruleUidSeq = 0;
const nextUid = () => `n${ruleUidSeq++}`;

function defaultWeights(variants: FlagVariant[]): Record<string, number> {
  return Object.fromEntries(variants.map((v, i) => [v.key, i === 0 ? 100 : 0]));
}

function parseServe(
  serve: unknown,
  variants: FlagVariant[],
): { serveVariant: string; weights: Record<string, number> } {
  const weights = defaultWeights(variants);
  if (serve && typeof serve === "object" && "rollout" in serve) {
    const rollout = (serve as { rollout: { variant: string; weight: number }[] }).rollout;
    for (const v of variants) weights[v.key] = 0;
    for (const r of rollout) weights[r.variant] = r.weight;
    return { serveVariant: ROLLOUT, weights };
  }
  const variant =
    serve && typeof serve === "object" && "variant" in serve
      ? (serve as { variant: string }).variant
      : variants[0]?.key ?? "";
  return { serveVariant: variant, weights };
}

function fromRule(
  rule: { conditions: unknown; serve: unknown },
  variants: FlagVariant[],
  uid: string,
): RuleDraft {
  const rawConds = (rule.conditions as Predicate[]) ?? [];
  const parsed = rawConds.map(fromPredicate);
  const { serveVariant, weights } = parseServe(rule.serve, variants);
  if (parsed.some((c) => c === null)) {
    return { uid, conds: [], serveVariant, weights, raw: rawConds };
  }
  return { uid, conds: parsed as CondDraft[], serveVariant, weights };
}

function buildServe(
  serveVariant: string,
  weights: Record<string, number>,
  variants: FlagVariant[],
): { serve: Serve } | { error: string } {
  if (serveVariant === ROLLOUT) {
    const rollout = variants
      .map((v) => ({ variant: v.key, weight: weights[v.key] ?? 0 }))
      .filter((r) => r.weight > 0);
    if (rollout.length === 0) {
      return { error: "give at least one variant a weight for the rollout" };
    }
    return { serve: { rollout } };
  }
  if (!serveVariant) return { error: "choose what to serve" };
  return { serve: { variant: serveVariant } };
}

function buildRule(
  draft: RuleDraft,
  variants: FlagVariant[],
): { conditions: Predicate[]; serve: Serve } | { error: string } {
  const s = buildServe(draft.serveVariant, draft.weights, variants);
  if ("error" in s) return s;
  if (draft.raw) return { conditions: draft.raw, serve: s.serve };
  const c = buildConditions(draft.conds);
  if ("error" in c) return c;
  return { conditions: c.conditions, serve: s.serve };
}

function serveFromDraft(draft: RuleDraft, variants: FlagVariant[]): Serve {
  const s = buildServe(draft.serveVariant, draft.weights, variants);
  return "error" in s ? { variant: draft.serveVariant } : s.serve;
}

/** JSON.stringify with object keys sorted, so two equal-but-differently-ordered
 * objects (e.g. app literal vs jsonb round-trip) serialize identically. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );
}

/**
 * The whole targeting section for one environment, Statsig-style: every rule is
 * an editable card, all at once, with the default pinned last as ELSE. Edits
 * stage locally; a single Save writes the entire ordered set atomically.
 */
function RulesEditor({
  slug,
  flagKey,
  envKey,
  rules,
  variants,
  segments,
  defaultLabel,
  readOnly = false,
  onSaved,
}: {
  slug: string;
  flagKey: string;
  envKey: string;
  rules: FlagEnvConfig["rules"];
  variants: FlagVariant[];
  segments: Segment[];
  defaultLabel: string;
  readOnly?: boolean;
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RuleDraft[]>(() =>
    rules.map((r, i) => fromRule(r, variants, `r${i}`)),
  );

  // Re-seed from the server whenever its rules change (i.e. after a save +
  // refresh), so drafts don't drift from what was persisted. This is React's
  // "adjust state while rendering" pattern — no effect, no cascading render.
  const serverSnapshot = JSON.stringify(rules.map((r) => [r.conditions, r.serve]));
  const [seededFrom, setSeededFrom] = useState(serverSnapshot);
  if (seededFrom !== serverSnapshot) {
    setSeededFrom(serverSnapshot);
    setDrafts(rules.map((r, i) => fromRule(r, variants, `r${i}`)));
    setError(null);
  }

  // Archived flag: rules are locked. Show them as a static IF / ELSE IF / ELSE
  // summary with no edit affordances at all.
  if (readOnly) {
    return (
      <div className="flex flex-col gap-2">
        {rules.map((r, i) => (
          <div
            key={r.id}
            className="flex items-center gap-2.5 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-sm"
          >
            <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              {i === 0 ? "If" : "Else if"}
            </span>
            <span className="min-w-0 text-zinc-400">
              {describe(r.conditions as Predicate[], r.serve, variants)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm">
          <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Else
          </span>
          <span className="text-zinc-500">
            serve default <span className="font-mono text-zinc-400">{defaultLabel}</span>
          </span>
        </div>
      </div>
    );
  }

  // Compare with key-stable stringify: Postgres jsonb hands `conditions`/`serve`
  // back with keys reordered, so a naive JSON.stringify would read as "dirty" on
  // every load even when nothing changed.
  const draftPayload = stableStringify(
    drafts.map((d) => {
      const built = buildRule(d, variants);
      return "error" in built ? null : [built.conditions, built.serve];
    }),
  );
  const dirty =
    draftPayload !== stableStringify(rules.map((r) => [r.conditions, r.serve]));

  const updateDraft = (uid: string, patch: Partial<RuleDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.uid === uid ? { ...d, ...patch } : d)));
  const removeDraft = (uid: string) =>
    setDrafts((prev) => prev.filter((d) => d.uid !== uid));
  const addRule = () =>
    setDrafts((prev) => [
      ...prev,
      {
        uid: nextUid(),
        conds: [emptyCond(segments)],
        serveVariant: variants[0]?.key ?? "",
        weights: defaultWeights(variants),
      },
    ]);

  function discard() {
    setDrafts(rules.map((r, i) => fromRule(r, variants, `r${i}`)));
    setError(null);
  }

  function save() {
    setError(null);
    const payload: { conditions: Predicate[]; serve: Serve }[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const built = buildRule(drafts[i], variants);
      if ("error" in built) {
        setError(`Rule ${i + 1}: ${built.error}.`);
        return;
      }
      payload.push(built);
    }
    start(async () => {
      const res = await saveRulesAction(slug, flagKey, envKey, payload);
      if (res.error) setError(res.error);
      else onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {drafts.map((d, i) => (
        <RuleCard
          key={d.uid}
          index={i}
          draft={d}
          variants={variants}
          segments={segments}
          onChange={(patch) => updateDraft(d.uid, patch)}
          onRemove={() => removeDraft(d.uid)}
        />
      ))}

      {/* Default — always last, always the fallback. */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm">
        <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Else
        </span>
        <span className="text-zinc-400">
          serve default <span className="font-mono text-zinc-300">{defaultLabel}</span>
        </span>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={addRule}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <Plus className="h-4 w-4" /> Add rule
        </button>
        {dirty ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

function RuleCard({
  index,
  draft,
  variants,
  segments,
  onChange,
  onRemove,
}: {
  index: number;
  draft: RuleDraft;
  variants: FlagVariant[];
  segments: Segment[];
  onChange: (patch: Partial<RuleDraft>) => void;
  onRemove: () => void;
}) {
  const label = index === 0 ? "If" : "Else if";

  const header = (
    <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
      {label}
    </span>
  );
  const removeButton = (
    <button
      type="button"
      onClick={onRemove}
      title="Remove rule"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );

  // Advanced (nested) rule: show it, let it be deleted, but don't try to edit it.
  if (draft.raw) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2.5 text-sm">
            {header}
            <span className="min-w-0 text-zinc-300">
              {describe(draft.raw, serveFromDraft(draft, variants), variants)}
            </span>
          </span>
          {removeButton}
        </div>
        <p className="mt-1.5 pl-16 text-[11px] text-zinc-500">
          Advanced condition. Edit via the API, or remove and rebuild it here.
        </p>
      </div>
    );
  }

  const setConds = (updater: (prev: CondDraft[]) => CondDraft[]) =>
    onChange({ conds: updater(draft.conds) });

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="mb-2 flex items-center justify-between">
        {header}
        {removeButton}
      </div>

      <ConditionRows
        conds={draft.conds}
        setConds={setConds}
        segments={segments}
        joiner="And"
      />

      <div className="mt-3 border-t border-white/8 pt-3">
        <ServePicker
          variants={variants}
          serveVariant={draft.serveVariant}
          setServeVariant={(v) => onChange({ serveVariant: v })}
          weights={draft.weights}
          setWeights={(fn) => onChange({ weights: fn(draft.weights) })}
        />
      </div>
    </div>
  );
}

function ServePicker({
  variants,
  serveVariant,
  setServeVariant,
  weights,
  setWeights,
}: {
  variants: FlagVariant[];
  serveVariant: string;
  setServeVariant: (v: string) => void;
  weights: Record<string, number>;
  setWeights: (fn: (prev: Record<string, number>) => Record<string, number>) => void;
}) {
  const isRollout = serveVariant === ROLLOUT;
  const totalWeight = variants.reduce((sum, v) => sum + (weights[v.key] ?? 0), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Serve
        </span>
        <Select
          value={serveVariant}
          onValueChange={setServeVariant}
          ariaLabel="Serve"
          options={[
            ...variants.map((v) => ({ value: v.key, label: v.label || String(v.value) })),
            { value: ROLLOUT, label: "a percentage rollout" },
          ]}
        />
      </div>

      {isRollout ? (
        <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-white/10 bg-black/20 p-3">
          {variants.map((v) => (
            <div key={v.key} className="flex items-center gap-2">
              <span className="w-28 truncate text-sm text-zinc-300">
                {v.label || String(v.value)}
              </span>
              <Input
                type="number"
                min={0}
                max={100}
                value={String(weights[v.key] ?? 0)}
                onChange={(e) =>
                  setWeights((prev) => ({
                    ...prev,
                    [v.key]: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                aria-label={`${v.key} weight`}
                className="w-20"
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          ))}
          <p
            className={`mt-0.5 text-xs ${
              totalWeight === 100 ? "text-zinc-500" : "text-amber-400"
            }`}
          >
            Total: {totalWeight}%{totalWeight !== 100 ? " (should be 100)" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function describeServe(serve: unknown, variants: FlagVariant[]): string {
  const label = (key: string) => variants.find((v) => v.key === key)?.label || key;
  if (serve && typeof serve === "object" && "rollout" in serve) {
    const rollout = (serve as { rollout: { variant: string; weight: number }[] }).rollout;
    return `a rollout (${rollout.map((r) => `${label(r.variant)} ${r.weight}%`).join(", ")})`;
  }
  const key =
    serve && typeof serve === "object" && "variant" in serve
      ? (serve as { variant: string }).variant
      : "?";
  return label(key);
}

function describe(
  conditions: Predicate[],
  serve: unknown,
  variants: FlagVariant[],
): string {
  const cond = conditions.map(describePredicate).join(" and ");
  const prefix = cond ? `If ${cond}, serve ` : "Serve ";
  return `${prefix}${describeServe(serve, variants)}`;
}
