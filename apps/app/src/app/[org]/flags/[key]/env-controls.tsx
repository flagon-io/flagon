"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Crosshair, Plus, PowerOff, Scale, Trash2 } from "lucide-react";
import { Button, Input, Select, Switch } from "@flagon/design";
import {
  saveRulesAction,
  setDefaultServeAction,
  setOffVariantAction,
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
  attributeSuggestions,
}: {
  slug: string;
  flagKey: string;
  env: FlagEnvConfig;
  variants: FlagVariant[];
  segments: Segment[];
  isBoolean: boolean;
  readOnly?: boolean;
  /** Attribute names to autocomplete in targeting rules, from the org's Entities. */
  attributeSuggestions?: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(env.enabled);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {open ? (
        <div className="border-t border-white/6 p-4">
          {/* Booleans serve `false` when off; a multivariate flag needs an
              explicit choice of what "off" returns, so offer it here. */}
          {!isBoolean ? (
            <OffVariantPicker
              slug={slug}
              flagKey={flagKey}
              env={env}
              variants={variants}
              readOnly={readOnly}
            />
          ) : null}
          <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <Crosshair className="h-3.5 w-3.5" /> Targeting rules
          </div>
          <RulesEditor
            slug={slug}
            flagKey={flagKey}
            envKey={env.key}
            rules={env.rules}
            defaultServe={env.defaultServe}
            defaultVariantKey={env.defaultVariantKey}
            variants={variants}
            segments={segments}
            isBoolean={isBoolean}
            readOnly={readOnly}
            attributeSuggestions={attributeSuggestions}
            onSaved={() => router.refresh()}
          />
        </div>
      ) : null}

      {error ? <p className="px-4 pb-3 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

/**
 * The value a multivariate flag serves while an environment is OFF (evaluation
 * reason DISABLED). Booleans don't need this (off is false); every other type
 * does, and without a control it silently defaults to the first variant.
 */
function OffVariantPicker({
  slug,
  flagKey,
  env,
  variants,
  readOnly,
}: {
  slug: string;
  flagKey: string;
  env: FlagEnvConfig;
  variants: FlagVariant[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(env.offVariantKey ?? variants[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);

  function choose(next: string) {
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      const res = await setOffVariantAction(slug, flagKey, env.key, next);
      if (res.error) {
        setValue(prev);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <PowerOff className="h-3.5 w-3.5" /> When off, serve
      </div>
      <Select
        value={value}
        onValueChange={choose}
        ariaLabel={`${env.name} off variant`}
        disabled={pending || readOnly}
        options={variants.map((v) => ({ value: v.key, label: v.label || String(v.value) }))}
      />
      <p className="mt-1.5 text-xs text-zinc-500">
        The value returned while this environment is off.
      </p>
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

// A sentinel value in the Serve select that switches to a weighted rollout —
// an option in the existing control, not a separate toggle.
const ROLLOUT = "__rollout__";
// Default bucketing identity. targetingKey is the OpenFeature-standard subject.
const TARGETING_KEY = "targetingKey";

/** The editable state of a "serve": a single variant, or a weighted rollout. */
type ServeDraft = {
  /** A variant key, or ROLLOUT for a weighted split. */
  serveVariant: string;
  weights: Record<string, number>;
  /** Attribute to bucket a rollout on; "" means targetingKey. */
  bucketBy: string;
};

type RuleDraft = ServeDraft & {
  /** Stable local key for React + edits. */
  uid: string;
  conds: CondDraft[];
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

/** Scale the positive weights to total exactly 100 (integers). If none are
 * positive, fall back to an even split across all variants. */
function balanceWeights(
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

function parseServe(serve: unknown, variants: FlagVariant[]): ServeDraft {
  const weights = defaultWeights(variants);
  if (serve && typeof serve === "object" && "rollout" in serve) {
    const s = serve as { rollout: { variant: string; weight: number }[]; bucketBy?: string };
    for (const v of variants) weights[v.key] = 0;
    for (const r of s.rollout) weights[r.variant] = r.weight;
    return { serveVariant: ROLLOUT, weights, bucketBy: s.bucketBy ?? "" };
  }
  const variant =
    serve && typeof serve === "object" && "variant" in serve
      ? (serve as { variant: string }).variant
      : (variants[0]?.key ?? "");
  return { serveVariant: variant, weights, bucketBy: "" };
}

function fromRule(
  rule: { conditions: unknown; serve: unknown },
  variants: FlagVariant[],
  uid: string,
): RuleDraft {
  const rawConds = (rule.conditions as Predicate[]) ?? [];
  const parsed = rawConds.map(fromPredicate);
  const serve = parseServe(rule.serve, variants);
  if (parsed.some((c) => c === null)) {
    return { uid, conds: [], ...serve, raw: rawConds };
  }
  return { uid, conds: parsed as CondDraft[], ...serve };
}

function buildServe(draft: ServeDraft, variants: FlagVariant[]): { serve: Serve } | { error: string } {
  if (draft.serveVariant === ROLLOUT) {
    const rollout = variants
      .map((v) => ({ variant: v.key, weight: draft.weights[v.key] ?? 0 }))
      .filter((r) => r.weight > 0);
    if (rollout.length === 0) {
      return { error: "give at least one variant a weight for the rollout" };
    }
    const total = rollout.reduce((sum, r) => sum + r.weight, 0);
    if (total !== 100) {
      return { error: `rollout weights must total 100% (currently ${total}%)` };
    }
    const bucketBy = draft.bucketBy.trim();
    return {
      serve:
        bucketBy && bucketBy !== TARGETING_KEY ? { rollout, bucketBy } : { rollout },
    };
  }
  if (!draft.serveVariant) return { error: "choose what to serve" };
  return { serve: { variant: draft.serveVariant } };
}

function buildRule(
  draft: RuleDraft,
  variants: FlagVariant[],
): { conditions: Predicate[]; serve: Serve } | { error: string } {
  const s = buildServe(draft, variants);
  if ("error" in s) return s;
  if (draft.raw) return { conditions: draft.raw, serve: s.serve };
  const c = buildConditions(draft.conds);
  if ("error" in c) return c;
  return { conditions: c.conditions, serve: s.serve };
}

function serveFromDraft(draft: ServeDraft, variants: FlagVariant[]): Serve {
  const s = buildServe(draft, variants);
  return "error" in s ? { variant: draft.serveVariant } : s.serve;
}

/** The server's current default as a Serve (rollout if set, else the variant). */
function currentDefaultServe(
  defaultServe: Serve | null,
  defaultVariantKey: string | null,
): Serve {
  return defaultServe ?? { variant: defaultVariantKey ?? "" };
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
 * an editable card, all at once, with the default as an editable ELSE serve
 * (which can itself be a percentage rollout). Edits stage locally; a single Save
 * writes the rules (atomic replace) and the default together.
 */
function RulesEditor({
  slug,
  flagKey,
  envKey,
  rules,
  defaultServe,
  defaultVariantKey,
  variants,
  segments,
  isBoolean,
  readOnly = false,
  attributeSuggestions,
  onSaved,
}: {
  slug: string;
  flagKey: string;
  envKey: string;
  rules: FlagEnvConfig["rules"];
  defaultServe: Serve | null;
  defaultVariantKey: string | null;
  variants: FlagVariant[];
  segments: Segment[];
  isBoolean: boolean;
  readOnly?: boolean;
  attributeSuggestions?: string[];
  onSaved: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<RuleDraft[]>(() =>
    rules.map((r, i) => fromRule(r, variants, `r${i}`)),
  );
  const serverDefault = currentDefaultServe(defaultServe, defaultVariantKey);
  const [defaultDraft, setDefaultDraft] = useState<ServeDraft>(() =>
    parseServe(serverDefault, variants),
  );

  // Re-seed from the server whenever its config changes (i.e. after a save +
  // refresh), so drafts don't drift from what was persisted. This is React's
  // "adjust state while rendering" pattern — no effect, no cascading render.
  const serverSnapshot = stableStringify([
    rules.map((r) => [r.conditions, r.serve]),
    serverDefault,
  ]);
  const [seededFrom, setSeededFrom] = useState(serverSnapshot);
  if (seededFrom !== serverSnapshot) {
    setSeededFrom(serverSnapshot);
    setDrafts(rules.map((r, i) => fromRule(r, variants, `r${i}`)));
    setDefaultDraft(parseServe(serverDefault, variants));
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
            serve <span className="text-zinc-400">{describeServe(serverDefault, variants)}</span>
          </span>
        </div>
      </div>
    );
  }

  const rulesDirty =
    stableStringify(
      drafts.map((d) => {
        const built = buildRule(d, variants);
        return "error" in built ? null : [built.conditions, built.serve];
      }),
    ) !== stableStringify(rules.map((r) => [r.conditions, r.serve]));

  const defaultDirty =
    stableStringify(serveFromDraft(defaultDraft, variants)) !==
    stableStringify(serverDefault);

  const dirty = rulesDirty || defaultDirty;

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
        bucketBy: "",
      },
    ]);

  function discard() {
    setDrafts(rules.map((r, i) => fromRule(r, variants, `r${i}`)));
    setDefaultDraft(parseServe(serverDefault, variants));
    setError(null);
  }

  function save() {
    setError(null);
    const rulePayload: { conditions: Predicate[]; serve: Serve }[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const built = buildRule(drafts[i], variants);
      if ("error" in built) {
        setError(`Rule ${i + 1}: ${built.error}.`);
        return;
      }
      rulePayload.push(built);
    }
    const builtDefault = buildServe(defaultDraft, variants);
    if ("error" in builtDefault) {
      setError(`Default: ${builtDefault.error}.`);
      return;
    }

    start(async () => {
      if (rulesDirty) {
        const res = await saveRulesAction(slug, flagKey, envKey, rulePayload);
        if (res.error) return setError(res.error);
      }
      if (defaultDirty) {
        const res = await setDefaultServeAction(slug, flagKey, envKey, builtDefault.serve);
        if (res.error) return setError(res.error);
      }
      onSaved();
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
          attributeSuggestions={attributeSuggestions}
          onChange={(patch) => updateDraft(d.uid, patch)}
          onRemove={() => removeDraft(d.uid)}
        />
      ))}

      {/* Default — always last, always the fallback, and itself editable. */}
      <div className="rounded-lg border border-dashed border-white/12 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="w-12 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Else
          </span>
          <span className="text-xs text-zinc-500">
            serve to everyone {drafts.length > 0 ? "not matched above" : "by default"}
          </span>
        </div>
        <div className="pl-14">
          <ServePicker
            variants={variants}
            draft={defaultDraft}
            onChange={(patch) => setDefaultDraft((prev) => ({ ...prev, ...patch }))}
            allowVariantRollout={isBoolean}
          />
        </div>
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
  attributeSuggestions,
  onChange,
  onRemove,
}: {
  index: number;
  draft: RuleDraft;
  variants: FlagVariant[];
  segments: Segment[];
  attributeSuggestions?: string[];
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
        attributeSuggestions={attributeSuggestions}
      />

      <div className="mt-3 border-t border-white/8 pt-3">
        <ServePicker variants={variants} draft={draft} onChange={onChange} />
      </div>
    </div>
  );
}

/**
 * The "serve" editor: a single variant, or a percentage rollout with a per-
 * variant weight (a live bar + a Balance button that snaps to 100%) and an
 * optional bucket-by attribute for consistent assignment.
 */
function ServePicker({
  variants,
  draft,
  onChange,
  allowVariantRollout = true,
}: {
  variants: FlagVariant[];
  draft: ServeDraft;
  onChange: (patch: Partial<ServeDraft>) => void;
  /** Whether the rollout option is offered (always true; kept for future gating). */
  allowVariantRollout?: boolean;
}) {
  const isRollout = draft.serveVariant === ROLLOUT;
  const total = variants.reduce((sum, v) => sum + (draft.weights[v.key] ?? 0), 0);
  const colors = ["bg-teal-400", "bg-sky-400", "bg-violet-400", "bg-amber-400", "bg-rose-400"];

  const setWeight = (key: string, value: number) =>
    onChange({ weights: { ...draft.weights, [key]: Math.max(0, value) } });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          Serve
        </span>
        <Select
          value={draft.serveVariant}
          onValueChange={(v) => onChange({ serveVariant: v })}
          ariaLabel="Serve"
          options={[
            ...variants.map((v) => ({ value: v.key, label: v.label || String(v.value) })),
            ...(allowVariantRollout || variants.length > 1
              ? [{ value: ROLLOUT, label: "a percentage rollout" }]
              : []),
          ]}
        />
      </div>

      {isRollout ? (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-white/10 bg-black/30 p-3">
          {/* Live distribution bar. */}
          <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
            {variants.map((v, i) =>
              (draft.weights[v.key] ?? 0) > 0 ? (
                <div
                  key={v.key}
                  className={colors[i % colors.length]}
                  style={{ width: `${((draft.weights[v.key] ?? 0) / (total || 1)) * 100}%` }}
                  title={`${v.label || v.key}: ${draft.weights[v.key] ?? 0}%`}
                />
              ) : null,
            )}
          </div>

          {variants.map((v, i) => (
            <div key={v.key} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${colors[i % colors.length]}`} />
              <span className="w-28 truncate text-sm text-zinc-300">
                {v.label || String(v.value)}
              </span>
              <Input
                type="number"
                min={0}
                max={100}
                value={String(draft.weights[v.key] ?? 0)}
                onChange={(e) => setWeight(v.key, Number(e.target.value) || 0)}
                aria-label={`${v.key} weight`}
                className="w-20"
              />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          ))}

          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs ${total === 100 ? "text-zinc-500" : "text-amber-400"}`}>
              Total: {total}%{total !== 100 ? " — must be 100" : ""}
            </p>
            {total !== 100 ? (
              <button
                type="button"
                onClick={() => onChange({ weights: balanceWeights(draft.weights, variants) })}
                className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                <Scale className="h-3.5 w-3.5" /> Balance to 100%
              </button>
            ) : null}
          </div>

          {/* Bucket-by: which attribute keeps a subject in the same slice. */}
          <label className="mt-1 flex flex-wrap items-center gap-2 border-t border-white/8 pt-2 text-xs text-zinc-500">
            Bucket by
            <Input
              value={draft.bucketBy}
              onChange={(e) => onChange({ bucketBy: e.target.value })}
              placeholder={TARGETING_KEY}
              aria-label="Bucket by attribute"
              className="w-44"
            />
            <span className="text-zinc-600">
              same value → same variant. Blank uses {TARGETING_KEY}.
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

function describeServe(serve: unknown, variants: FlagVariant[]): string {
  const label = (key: string) => variants.find((v) => v.key === key)?.label || key;
  if (serve && typeof serve === "object" && "rollout" in serve) {
    const s = serve as { rollout: { variant: string; weight: number }[]; bucketBy?: string };
    const by = s.bucketBy ? ` by ${s.bucketBy}` : "";
    return `a rollout${by} (${s.rollout.map((r) => `${label(r.variant)} ${r.weight}%`).join(", ")})`;
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
