"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Crosshair,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
} from "lucide-react";
import {
  Button,
  cn,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SegmentedControl,
  Select,
} from "@flagon/design";
import {
  saveRulesAction,
  setDefaultServeAction,
  setEnvModeAction,
  setFeatureStateAction,
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
import { variantLabel } from "@/lib/variant-label";
import {
  balanceWeights,
  buildServe,
  defaultProgressive,
  defaultWeights,
  hasServeErrors,
  parseServe,
  serveFromDraft,
  stepDurationMs,
  TARGETING_KEY,
  validateServe,
  type DurationUnit,
  type ProgressiveDraft,
  type ServeDraft,
  type ServeErrors,
} from "./serve-model";

function serveVariantKey(serve: Serve | null): string | null {
  return serve && typeof serve === "object" && "variant" in serve
    ? (serve as { variant: string }).variant
    : null;
}

// The two non-value modes in the top control (distinct from any variant key).
const RULES_MODE = "__rules__";
const REUSE_MODE = "__reuse__";
// The "a percentage split" option in the default-serve dropdown.
const SPLIT_DEFAULT = "__split__";
// The "a progressive rollout" option in a serve dropdown.
const PROGRESSIVE = "__progressive__";

/**
 * One environment's evaluation control, Vercel-style: a single segmented control
 * picks ONE of four mutually-exclusive MODES — a static value (Off / On / a
 * variant), Custom Rules, or Reuse another environment's config. They are not
 * additive; the mode IS how the flag evaluates here. The mode is derived from the
 * stored config; switching writes it (and clears rules when leaving Rules for a
 * static value or Reuse, with a confirm). The panel below configures the active mode.
 */
export function EnvCard({
  slug,
  flagKey,
  env: envProp,
  variants,
  segments,
  isBoolean,
  readOnly = false,
  attributeSuggestions,
  allEnvironments,
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
  /** Every environment (for the Reuse-source picker); the current one is filtered out. */
  allEnvironments: { key: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);

  // Hold the env config in state so a save can patch just THIS card from the action's
  // returned env, instead of router.refresh() re-running the whole page loader (which
  // refetches segments/members/entities/usage too). Re-seed when the server sends new
  // props (navigation, or the fallback refresh below). See flags/actions.ts envAfter.
  const [env, setEnv] = useState(envProp);
  const [envSnap, setEnvSnap] = useState(() => stableStringify(envProp));
  const propSnap = stableStringify(envProp);
  if (propSnap !== envSnap) {
    setEnvSnap(propSnap);
    setEnv(envProp);
  }
  // Apply a mutation result: patch state from the returned env, or fall back to a full
  // refresh if the action couldn't read it back.
  const applyEnv = (next?: FlagEnvConfig) => {
    if (next) setEnv(next);
    else router.refresh();
  };
  // The pending static value awaiting confirmation to discard rules.
  const [confirmValue, setConfirmValue] = useState<string | null>(null);

  // Derive the current mode from stored config — one source of truth, no separate
  // "enabled" concept competing with the value.
  const serverMode = env.reuseSourceEnvironmentKey
    ? REUSE_MODE
    : env.rules.length > 0
      ? RULES_MODE
      : isBoolean
        ? env.enabled
          ? "on"
          : "off"
        : (serveVariantKey(env.defaultServe) ??
          env.defaultVariantKey ??
          variants[0]?.key ??
          "");
  const mode = optimistic ?? serverMode;
  if (optimistic !== null && optimistic === serverMode) setOptimistic(null);

  const valueOptions = isBoolean
    ? [
        { value: "off", label: "Off" },
        { value: "on", label: "On" },
      ]
    : variants.map((v, i) => ({ value: v.key, label: variantLabel(v, i) }));
  const options = [
    ...valueOptions,
    {
      value: RULES_MODE,
      label: <Crosshair className="size-4" />,
      title: "Custom rules",
    },
    {
      value: REUSE_MODE,
      label: <RefreshCw className="size-4" />,
      title: "Reuse another environment's configuration",
    },
  ];
  const valueLabel = (v: string) => valueOptions.find((o) => o.value === v)?.label ?? v;

  // Write a static value (Off / On / a variant): the flag is active, that value is
  // the default, no reuse. Any targeting rules are cleared — they no longer apply.
  function serveValue(value: string) {
    setError(null);
    setOptimistic(value);
    start(async () => {
      const res = await setEnvModeAction(
        slug,
        flagKey,
        env.key,
        isBoolean
          ? { enabled: value === "on", reuseSourceEnvironmentKey: null }
          : { enabled: true, defaultServe: { variant: value }, reuseSourceEnvironmentKey: null },
        { clearRules: env.rules.length > 0 },
      );
      if (res.error) {
        setOptimistic(null);
        setError(res.error);
      } else applyEnv(res.env);
    });
  }

  function apply(next: string) {
    if (readOnly || pending || next === mode) return;
    if (next === RULES_MODE) {
      setError(null);
      setOptimistic(RULES_MODE);
      start(async () => {
        const res = await setEnvModeAction(slug, flagKey, env.key, {
          enabled: true,
          reuseSourceEnvironmentKey: null,
        });
        if (res.error) {
          setOptimistic(null);
          setError(res.error);
        } else applyEnv(res.env);
      });
      return;
    }
    if (next === REUSE_MODE) {
      // Reuse needs a source env chosen in the auto-opened panel.
      setError(null);
      setOptimistic(REUSE_MODE);
      return;
    }
    // A static value: confirm first if it would discard targeting rules.
    if (env.rules.length > 0) {
      setConfirmValue(next);
      return;
    }
    serveValue(next);
  }

  function setReuse(sourceKey: string) {
    setError(null);
    start(async () => {
      const res = await setEnvModeAction(
        slug,
        flagKey,
        env.key,
        { reuseSourceEnvironmentKey: sourceKey },
        { clearRules: env.rules.length > 0 },
      );
      if (res.error) setError(res.error);
      else applyEnv(res.env);
    });
  }

  const summary =
    mode === REUSE_MODE
      ? `Reusing ${env.reuseSourceEnvironmentKey ?? "another environment"}`
      : mode === RULES_MODE
        ? `${env.rules.length} targeting rule${env.rules.length === 1 ? "" : "s"}`
        : `Serving ${valueLabel(mode)} to everyone`;

  const otherEnvs = allEnvironments.filter((e) => e.key !== env.key);
  // No manual collapse: only the modes that need configuring (Rules, Reuse) open a
  // panel; a static value has nothing to configure, so the card stays a single row.
  const expanded = mode === RULES_MODE || mode === REUSE_MODE;

  return (
    <div className="rounded-xl border border-white/8 bg-white/2">
      <div className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-medium text-zinc-100">{env.name}</p>
          <p className="truncate text-xs text-zinc-500">{summary}</p>
        </div>
        <SegmentedControl
          value={mode}
          onValueChange={apply}
          options={options}
          ariaLabel={`${env.name} mode`}
          size="sm"
          sizing="content"
          className={`shrink-0 transition-opacity ${
            readOnly
              ? "pointer-events-none opacity-60"
              : pending
                ? "pointer-events-none animate-pulse opacity-70"
                : ""
          }`}
        />
      </div>

      {expanded ? (
        <div className="border-t border-white/6 p-4">
          {mode === RULES_MODE ? (
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
              enabled={env.enabled}
              readOnly={readOnly}
              attributeSuggestions={attributeSuggestions}
              onSaved={applyEnv}
            />
          ) : (
            <ReusePanel
              current={env.reuseSourceEnvironmentKey}
              options={otherEnvs}
              disabled={readOnly || pending}
              onPick={setReuse}
            />
          )}
        </div>
      ) : null}

      {error ? <p className="px-4 pb-3 text-xs text-red-400">{error}</p> : null}

      {confirmValue !== null ? (
        <Modal onClose={() => setConfirmValue(null)} size="sm">
          <ModalHeader title="Discard targeting rules?" onClose={() => setConfirmValue(null)} />
          <ModalBody>
            <p className="text-sm text-zinc-400">
              Switching {env.name} to serve{" "}
              <span className="font-medium text-zinc-200">{valueLabel(confirmValue)}</span>{" "}
              to everyone removes its {env.rules.length} targeting rule
              {env.rules.length === 1 ? "" : "s"}. This can&apos;t be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" onClick={() => setConfirmValue(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const v = confirmValue;
                setConfirmValue(null);
                serveValue(v);
              }}
            >
              Discard and switch
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </div>
  );
}

/** The Reuse mode's panel: pick which environment's config this one inherits. */
function ReusePanel({
  current,
  options,
  disabled,
  onPick,
}: {
  current: string | null;
  options: { key: string; name: string }[];
  disabled: boolean;
  onPick: (sourceKey: string) => void;
}) {
  if (options.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        There are no other environments to reuse a configuration from.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Reuse the configuration of
      </label>
      <Select
        value={current ?? ""}
        onValueChange={onPick}
        disabled={disabled}
        ariaLabel="Reuse source environment"
        className="w-full sm:w-72"
        options={[
          ...(current ? [] : [{ value: "", label: "Choose an environment…" }]),
          ...options.map((e) => ({ value: e.key, label: e.name })),
        ]}
      />
      <p className="text-xs text-zinc-600">
        This environment evaluates exactly like the one you choose. Changes there
        apply here automatically.
      </p>
    </div>
  );
}

type RuleDraft = ServeDraft & {
  /** Stable local key for React + edits. */
  uid: string;
  /** The rule's name, persisted as flag_rules.description; optional. */
  name: string;
  conds: CondDraft[];
  /**
   * Set when a stored rule uses nested AND/OR groups the flat builder can't
   * represent. We keep the raw conditions and render the rule read-only so an
   * edit elsewhere never silently drops the advanced logic.
   */
  raw?: Predicate[];
};

// A unique local key for a newly-added rule. Only ever called from a click
// handler (client-side, post-hydration), so randomness is safe — and unlike a
// module counter it can't collide after a Fast Refresh resets module state. The
// initial drafts use deterministic `r${i}` keys instead (see fromRule callers).
const nextUid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? `n_${crypto.randomUUID()}`
    : `n_${Date.now()}_${Math.random().toString(36).slice(2)}`;

function fromRule(
  rule: { conditions: unknown; serve: unknown; description?: string | null },
  variants: FlagVariant[],
  uid: string,
): RuleDraft {
  const rawConds = (rule.conditions as Predicate[]) ?? [];
  const parsed = rawConds.map(fromPredicate);
  const serve = parseServe(rule.serve, variants);
  const name = rule.description ?? "";
  if (parsed.some((c) => c === null)) {
    return { uid, name, conds: [], ...serve, raw: rawConds };
  }
  return { uid, name, conds: parsed as CondDraft[], ...serve };
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
  enabled,
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
  /** The env's current enabled state, so a multivariate save can self-enable. */
  enabled: boolean;
  readOnly?: boolean;
  attributeSuggestions?: string[];
  onSaved: (env?: FlagEnvConfig) => void;
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
            <span className="w-14 shrink-0 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
              {i === 0 ? "If" : "Else if"}
            </span>
            <span className="min-w-0 text-zinc-400">
              {describe(r.conditions as Predicate[], r.serve, variants)}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-white/10 px-3 py-2.5 text-sm">
          <span className="w-12 shrink-0 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
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

  // Block Save while any serve draft (a rule's or the default's) is invalid, so a
  // bad percentage or split can never be written. Inline errors say what's wrong.
  const invalid =
    hasServeErrors(validateServe(defaultDraft, variants)) ||
    drafts.some((d) => !d.raw && hasServeErrors(validateServe(d, variants)));

  const updateDraft = (uid: string, patch: Partial<RuleDraft>) =>
    setDrafts((prev) => prev.map((d) => (d.uid === uid ? { ...d, ...patch } : d)));
  const removeDraft = (uid: string) =>
    setDrafts((prev) => prev.filter((d) => d.uid !== uid));
  // Add Rule appends a targeting rule (rules are additive). Add Rollout / Add Split
  // instead configure the ONE default ("when no rule matches") — a progressive
  // rollout or a percentage split — so once the default is either, those two vanish
  // (you can't have a second default), Vercel-style. Add Rule always stays.
  const addRule = () =>
    setDrafts((prev) => [
      ...prev,
      {
        uid: nextUid(),
        name: "",
        conds: [emptyCond(segments)],
        weights: defaultWeights(variants),
        bucketBy: "",
      },
    ]);
  const setDefaultProgressive = () =>
    setDefaultDraft((prev) => ({ ...prev, progressive: defaultProgressive(variants, Date.now()) }));
  const setDefaultSplit = () =>
    setDefaultDraft({ weights: balanceWeights({}, variants), bucketBy: "" });
  const defaultIsAdvanced =
    Boolean(defaultDraft.progressive) ||
    variants.filter((v) => (defaultDraft.weights[v.key] ?? 0) > 0).length > 1;
  const canSplit = variants.length >= 2;

  function discard() {
    setDrafts(rules.map((r, i) => fromRule(r, variants, `r${i}`)));
    setDefaultDraft(parseServe(serverDefault, variants));
    setError(null);
  }

  function save() {
    setError(null);
    const rulePayload: {
      conditions: Predicate[];
      serve: Serve;
      description: string | null;
    }[] = [];
    for (let i = 0; i < drafts.length; i++) {
      const built = buildRule(drafts[i]!, variants);
      if ("error" in built) {
        setError(`Rule ${i + 1}: ${built.error}.`);
        return;
      }
      rulePayload.push({ ...built, description: drafts[i]!.name.trim() || null });
    }
    const builtDefault = buildServe(defaultDraft, variants);
    if ("error" in builtDefault) {
      setError(`Default: ${builtDefault.error}.`);
      return;
    }

    start(async () => {
      // Track the freshest env returned by each write so onSaved can patch the card
      // in place (the last write wins) instead of a full-page refresh.
      let latest: FlagEnvConfig | undefined;
      if (rulesDirty) {
        const res = await saveRulesAction(slug, flagKey, envKey, rulePayload);
        if (res.error) return setError(res.error);
        latest = res.env;
      }
      // A multivariate flag is never "off": ensure it is enabled whenever its
      // config is written, so rules and rollouts actually take effect (evaluation
      // returns DISABLED before consulting them otherwise). Boolean flags keep
      // their explicit Off/On state.
      if (!isBoolean && (defaultDirty || !enabled)) {
        const res = await setFeatureStateAction(slug, flagKey, envKey, {
          enabled: true,
          defaultServe: builtDefault.serve,
        });
        if (res.error) return setError(res.error);
        latest = res.env;
      } else if (defaultDirty) {
        const res = await setDefaultServeAction(slug, flagKey, envKey, builtDefault.serve);
        if (res.error) return setError(res.error);
        latest = res.env;
      }
      onSaved(latest);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {drafts.map((d, i) => (
        <RuleCard
          key={d.uid}
          index={i}
          draft={d}
          variants={variants}
          segments={segments}
          isBoolean={isBoolean}
          attributeSuggestions={attributeSuggestions}
          onChange={(patch) => updateDraft(d.uid, patch)}
          onRemove={() => removeDraft(d.uid)}
        />
      ))}

      {/* Add Rule (additive) always; Add Rollout / Add Split set the single default
          and disappear once it's already a rollout or split. */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={addRule}>
          <Plus className="size-4" /> Add Rule
        </Button>
        {canSplit && !defaultIsAdvanced ? (
          <>
            <Button variant="secondary" size="sm" onClick={setDefaultProgressive}>
              <Plus className="size-4" /> Add Rollout
            </Button>
            <Button variant="secondary" size="sm" onClick={setDefaultSplit}>
              <Plus className="size-4" /> Add Split
            </Button>
          </>
        ) : null}
      </div>

      {/* The ELSE closes the chain: a value, or a percentage split, served when no
          rule matches — editable right here (Vercel's "when no other rules match"). */}
      <RuleShell railLabel="Else">
        <div className="p-3">
          <ServeField
            label="When no rule matches, serve"
            variants={variants}
            draft={defaultDraft}
            isBoolean={isBoolean}
            onChange={setDefaultDraft}
          />
        </div>
      </RuleShell>

      {/* Always-present action bar, flush to the card edges (mirrors the settings
          footer). The buttons DISABLE when there's nothing staged, rather than
          appearing and disappearing, so the card never jumps as you edit. */}
      <div className="-mx-4 mt-2 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/8 px-4 py-3">
        {error ? <p className="mr-auto text-xs text-red-400">{error}</p> : null}
        <Button variant="secondary" size="sm" onClick={discard} disabled={pending || !dirty}>
          Discard
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={pending || !dirty || invalid}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The card shell with a Statsig-style vertical rail carrying the rule's place in
 * the chain ("If" / "Else if" / "Else"), so the branch structure reads down the
 * left edge and the rule's own name/conditions never get confused for it.
 */
function RuleShell({
  railLabel,
  children,
}: {
  railLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <div className="flex w-8 shrink-0 items-center justify-center border-r border-white/8 bg-white/2 py-3">
        <span className="rotate-180 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase [writing-mode:vertical-lr]">
          {railLabel}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function RuleCard({
  index,
  draft,
  variants,
  segments,
  isBoolean,
  attributeSuggestions,
  onChange,
  onRemove,
}: {
  index: number;
  draft: RuleDraft;
  variants: FlagVariant[];
  segments: Segment[];
  isBoolean: boolean;
  attributeSuggestions?: string[];
  onChange: (patch: Partial<RuleDraft>) => void;
  onRemove: () => void;
}) {
  const railLabel = index === 0 ? "If" : "Else if";

  const removeButton = (
    <button
      type="button"
      onClick={onRemove}
      title="Remove rule"
      className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400"
    >
      <Trash2 className="size-4" />
    </button>
  );

  // Advanced (nested) rule: show it, let it be deleted, but don't try to edit it.
  if (draft.raw) {
    return (
      <RuleShell railLabel={railLabel}>
        <div className="flex items-start justify-between gap-2 p-3">
          <div className="min-w-0">
            {draft.name ? (
              <p className="mb-1 text-sm font-medium text-zinc-200">{draft.name}</p>
            ) : null}
            <p className="min-w-0 text-sm text-zinc-300">
              {describe(draft.raw, serveFromDraft(draft, variants), variants)}
            </p>
            <p className="mt-1.5 text-[11px] text-zinc-500">
              Advanced condition. Edit via the API, or remove and rebuild it here.
            </p>
          </div>
          {removeButton}
        </div>
      </RuleShell>
    );
  }

  const setConds = (updater: (prev: CondDraft[]) => CondDraft[]) =>
    onChange({ conds: updater(draft.conds) });

  return (
    <RuleShell railLabel={railLabel}>
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
        <input
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name this rule (optional)"
          aria-label="Rule name"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-zinc-100 outline-none placeholder:font-normal placeholder:text-zinc-500"
        />
        {removeButton}
      </div>
      <div className="border-t border-white/8 p-3">
        <ConditionRows
          conds={draft.conds}
          setConds={setConds}
          segments={segments}
          joiner="And"
          leadWord=""
          attributeSuggestions={attributeSuggestions}
        />
      </div>
      <div className="border-t border-white/8 p-3">
        <ServeField
          label="Serve"
          variants={variants}
          draft={draft}
          isBoolean={isBoolean}
          onChange={(d) => onChange(d)}
        />
      </div>
    </RuleShell>
  );
}

const SPLIT_COLORS = [
  "bg-teal-400",
  "bg-sky-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
];

/** For a boolean the variants read as On/Off (matching the state control); every
 *  other flag uses the variant's own label. */
function splitLabel(v: FlagVariant, i: number, isBoolean: boolean): string {
  if (isBoolean) return v.value === true ? "On" : "Off";
  return variantLabel(v, i);
}

/**
 * A "Serve" field: a dropdown of each variant plus "a percentage split". Picking a
 * variant serves it to 100%; picking the split reveals the SplitPanel below. Used
 * for both a rule's serve and the environment's default, so they read and behave
 * identically. `onChange` receives the whole replacement ServeDraft.
 */
export function ServeField({
  label,
  variants,
  draft,
  isBoolean,
  onChange,
}: {
  label: string;
  variants: FlagVariant[];
  draft: ServeDraft;
  isBoolean: boolean;
  onChange: (draft: ServeDraft) => void;
}) {
  const isProgressive = Boolean(draft.progressive);
  const isSplit =
    !isProgressive && variants.filter((v) => (draft.weights[v.key] ?? 0) > 0).length > 1;
  const value = isProgressive
    ? PROGRESSIVE
    : isSplit
      ? SPLIT_DEFAULT
      : ((variants.find((v) => (draft.weights[v.key] ?? 0) > 0) ?? variants[0])?.key ?? "");
  const canProgressive = variants.length >= 2;
  const options = [
    ...variants.map((v, i) => ({ value: v.key, label: splitLabel(v, i, isBoolean) })),
    ...(canProgressive
      ? [
          { value: SPLIT_DEFAULT, label: "a percentage split" },
          { value: PROGRESSIVE, label: "a progressive rollout" },
        ]
      : []),
  ];
  const onSelect = (v: string) => {
    if (v === PROGRESSIVE) {
      onChange({ ...draft, progressive: defaultProgressive(variants, Date.now()) });
    } else if (v === SPLIT_DEFAULT) {
      onChange({ weights: balanceWeights({}, variants), bucketBy: "" });
    } else {
      onChange({
        weights: Object.fromEntries(variants.map((x) => [x.key, x.key === v ? 100 : 0])),
        bucketBy: "",
      });
    }
  };
  const errors = validateServe(draft, variants);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-400">{label}</span>
        <Select
          value={value}
          onValueChange={onSelect}
          ariaLabel={label}
          className="w-auto min-w-24"
          options={options}
        />
      </div>
      {isProgressive && draft.progressive ? (
        <ProgressiveEditor
          variants={variants}
          draft={draft.progressive}
          isBoolean={isBoolean}
          errors={errors.progressive}
          onChange={(p) => onChange({ ...draft, progressive: p })}
        />
      ) : isSplit ? (
        <SplitPanel
          variants={variants}
          draft={draft}
          isBoolean={isBoolean}
          errors={errors.split}
          onChange={(patch) => onChange({ ...draft, ...patch })}
        />
      ) : null}
    </div>
  );
}

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: "minutes", label: "minutes" },
  { value: "hours", label: "hours" },
  { value: "days", label: "days" },
];

/**
 * When the rollout clock starts. We only support "Upon saving" (the schedule
 * runs from the moment the flag is saved), matching how Flagon persists `start`
 * at save time; the field exists so the model reads like Vercel's.
 */
const START_OPTIONS = [{ value: "upon-saving", label: "Upon saving" }];

/** A left-labelled control row (Vercel-style): narrow label column, controls right. */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

/** Red border/ring appended to an invalid field's className (wins via tailwind-merge). */
const ERROR_RING = "border-red-500/60 focus:border-red-500 focus:ring-red-500/25";

/** Inline validation message (Vercel-style: alert glyph + red text). */
function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-400">
      <CircleAlert className="size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** A human duration for a total of ms, e.g. "1 day", "18 hours". */
function humanDuration(ms: number): string {
  const day = 86_400_000;
  const hour = 3_600_000;
  const min = 60_000;
  if (ms >= day && ms % day === 0) return `${ms / day} day${ms / day === 1 ? "" : "s"}`;
  if (ms >= hour && ms % hour === 0) return `${ms / hour} hour${ms / hour === 1 ? "" : "s"}`;
  if (ms % hour === 0) return `${ms / hour} hours`;
  return `${Math.round(ms / min)} minutes`;
}

/**
 * The progressive-rollout editor (Vercel-style): what to roll out, the fallback,
 * the bucketing identity, and a stepped schedule (hold N% for a duration, then step
 * up; past the schedule it's fully rolled out) with a live step chart.
 */
export function ProgressiveEditor({
  variants,
  draft,
  isBoolean,
  errors,
  onChange,
}: {
  variants: FlagVariant[];
  draft: ProgressiveDraft;
  isBoolean: boolean;
  errors?: ServeErrors["progressive"];
  onChange: (draft: ProgressiveDraft) => void;
}) {
  const variantOptions = variants.map((v, i) => ({
    value: v.key,
    label: splitLabel(v, i, isBoolean),
  }));
  const setStep = (i: number, patch: Partial<ProgressiveDraft["steps"][number]>) =>
    onChange({ ...draft, steps: draft.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const insertStep = (at: number) => {
    const next = [...draft.steps];
    next.splice(at, 0, { percent: 100, value: 6, unit: "hours" });
    onChange({ ...draft, steps: next });
  };
  const removeStep = (i: number) =>
    onChange({ ...draft, steps: draft.steps.filter((_, j) => j !== i) });
  const totalMs = draft.steps.reduce((sum, s) => sum + stepDurationMs(s.value, s.unit), 0);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-white/8 bg-black/20 p-4">
      <div className="flex flex-col gap-3">
        <FieldRow label="Based on">
          <Input
            value={draft.bucketBy}
            onChange={(e) => onChange({ ...draft, bucketBy: e.target.value })}
            placeholder={TARGETING_KEY}
            aria-label="Bucket by attribute"
            className="h-8 w-52 font-mono"
          />
        </FieldRow>
        <FieldRow label="Roll from">
          <Select
            value={draft.fallback}
            onValueChange={(v) => onChange({ ...draft, fallback: v })}
            ariaLabel="Roll from variant"
            options={variantOptions}
            className={cn("h-8 w-40", errors?.fallback && ERROR_RING)}
          />
          <span className="text-xs text-zinc-500">to</span>
          <Select
            value={draft.variant}
            onValueChange={(v) => onChange({ ...draft, variant: v })}
            ariaLabel="Roll to variant"
            options={variantOptions}
            className={cn("h-8 w-40", errors?.variant && ERROR_RING)}
          />
        </FieldRow>
        {errors?.form ? <ErrorText>{errors.form}</ErrorText> : null}
        <FieldRow label="Start">
          <Select
            value="upon-saving"
            onValueChange={() => {}}
            ariaLabel="When the rollout starts"
            options={START_OPTIONS}
            className="h-8 w-52"
          />
        </FieldRow>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Schedule</span>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <StepChart steps={draft.steps} />
          <div className="flex flex-col gap-2">
            {draft.steps.map((s, i) => {
              const stepErr = errors?.steps?.[i];
              return (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input
              type="number"
              min={0}
              max={100}
              value={String(s.percent)}
              onChange={(e) => setStep(i, { percent: Number(e.target.value) || 0 })}
              aria-label={`Step ${i + 1} percent`}
              className={cn("h-8 w-16 text-right", stepErr?.percent && ERROR_RING)}
            />
            <span className="text-zinc-500">% for</span>
            <Input
              type="number"
              min={1}
              value={String(s.value)}
              onChange={(e) => setStep(i, { value: Number(e.target.value) || 0 })}
              aria-label={`Step ${i + 1} duration`}
              className={cn("h-8 w-16 text-right", stepErr?.duration && ERROR_RING)}
            />
            <Select
              value={s.unit}
              onValueChange={(u) => setStep(i, { unit: u as DurationUnit })}
              ariaLabel={`Step ${i + 1} unit`}
              className="w-28"
              options={DURATION_UNITS}
            />
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  title="Step options"
                  aria-label={`Step ${i + 1} options`}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => insertStep(i)}>
                  <ArrowUp className="size-4" /> Add step before
                </MenuItem>
                <MenuItem onSelect={() => insertStep(i + 1)}>
                  <ArrowDown className="size-4" /> Add step after
                </MenuItem>
                {draft.steps.length > 1 ? (
                  <>
                    <MenuSeparator />
                    <MenuItem
                      onSelect={() => removeStep(i)}
                      className="text-red-400 data-highlighted:text-red-300"
                    >
                      <Trash2 className="size-4" /> Delete
                    </MenuItem>
                  </>
                ) : null}
              </MenuContent>
            </Menu>
            </div>
            {stepErr?.percent ? <ErrorText>{stepErr.percent}</ErrorText> : null}
            {stepErr?.duration ? <ErrorText>{stepErr.duration}</ErrorText> : null}
          </div>
              );
            })}
            <span className="text-xs text-zinc-600">
              Reaches 100% after {humanDuration(totalMs)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Short axis label for a duration: "6h", "12h", "1d". */
function shortDuration(ms: number): string {
  if (ms <= 0) return "0";
  const day = 86_400_000;
  const hour = 3_600_000;
  if (ms % day === 0) return `${ms / day}d`;
  const h = ms / hour;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
}

/**
 * The rollout-schedule chart (Vercel-style): a stepped line of served-percentage
 * over time, with a 0–100% axis, time ticks, and a subtle fill. Scales uniformly
 * (no stretch) so the labels stay crisp.
 */
function StepChart({ steps }: { steps: ProgressiveDraft["steps"] }) {
  const W = 360;
  const H = 150;
  const PAD_L = 30;
  const PAD_R = 6;
  const PAD_T = 8;
  const PAD_B = 18;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const total = steps.reduce((sum, s) => sum + stepDurationMs(s.value, s.unit), 0) || 1;
  const x = (ms: number) => PAD_L + (ms / total) * plotW;
  const y = (pct: number) => PAD_T + (1 - Math.max(0, Math.min(100, pct)) / 100) * plotH;

  // Step points: hold each percent for its duration, then jump to 100% at the end.
  const pts: [number, number][] = [];
  let acc = 0;
  for (const s of steps) {
    pts.push([x(acc), y(s.percent)]);
    acc += stepDurationMs(s.value, s.unit);
    pts.push([x(acc), y(s.percent)]);
  }
  pts.push([x(total), y(100)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${x(total).toFixed(1)},${y(0)} L${PAD_L},${y(0)} Z`;
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => total * f);

  const gradId = "rollout-fill";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rollout schedule">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.02} />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(g)} y2={y(g)} className="stroke-white/10" strokeWidth={1} />
          <text x={PAD_L - 6} y={y(g) + 3} textAnchor="end" className="fill-zinc-500 text-[9px]">
            {g}%
          </text>
        </g>
      ))}
      {xTicks.map((ms, i) => (
        <text
          key={i}
          x={x(ms)}
          y={H - 5}
          textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
          className="fill-zinc-500 text-[9px]"
        >
          {shortDuration(ms)}
        </text>
      ))}
      <path d={area} fill={`url(#${gradId})`} />
      <path d={line} className="stroke-teal-400" strokeWidth={2} strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Sentinel for "no fallback" — Radix Select can't hold an empty-string value. */
const NO_FALLBACK = "__none__";

/**
 * The Split editor (Vercel-style): the "Based on" attribute a subject is bucketed
 * by (so they stay put) and a "Fallback" for subjects missing that attribute, then
 * a live distribution bar with a 0–100% scale, a per-variant weight row, "Distribute
 * evenly", and a "Show weights" toggle. 100% to one variant is a plain serve;
 * spreading it is a rollout. For a boolean this reads as the On/Off split.
 */
export function SplitPanel({
  variants,
  draft,
  onChange,
  isBoolean,
  errors,
}: {
  variants: FlagVariant[];
  draft: ServeDraft;
  onChange: (patch: Partial<ServeDraft>) => void;
  isBoolean: boolean;
  errors?: ServeErrors["split"];
}) {
  const [showWeights, setShowWeights] = useState(true);
  const total = variants.reduce((sum, v) => sum + (draft.weights[v.key] ?? 0), 0);
  const variantOptions = variants.map((v, i) => ({
    value: v.key,
    label: splitLabel(v, i, isBoolean),
  }));
  const fallbackOptions = [{ value: NO_FALLBACK, label: "No fallback" }, ...variantOptions];
  const setWeight = (key: string, value: number) =>
    onChange({
      weights: { ...draft.weights, [key]: Math.max(0, Math.min(100, value)) },
    });

  return (
    <div className="flex flex-col gap-3">
      {/* Based on + Fallback (Vercel-style left-label rows). Fallback serves subjects
          that lack the Based-on attribute, so they aren't all hashed to one slice. */}
      <div className="flex flex-col gap-2">
        <FieldRow label="Based on">
          <Input
            value={draft.bucketBy}
            onChange={(e) => onChange({ bucketBy: e.target.value })}
            placeholder={TARGETING_KEY}
            aria-label="Bucket by attribute"
            className="h-8 w-52 font-mono"
          />
        </FieldRow>
        <FieldRow label="Fallback">
          <Select
            value={draft.fallback || NO_FALLBACK}
            onValueChange={(v) => onChange({ fallback: v === NO_FALLBACK ? "" : v })}
            ariaLabel="Fallback variant when the attribute is absent"
            options={fallbackOptions}
            className="h-8 w-52"
          />
        </FieldRow>
      </div>

      {/* Split into: distribution bar + a 0–100% scale beneath it. */}
      <div>
        <div className="mb-1.5 text-xs text-zinc-500">Split into</div>
        <div className="flex h-2 overflow-hidden rounded-full bg-white/8">
          {variants.map((v, i) =>
            (draft.weights[v.key] ?? 0) > 0 ? (
              <div
                key={v.key}
                className={SPLIT_COLORS[i % SPLIT_COLORS.length]}
                style={{ width: `${((draft.weights[v.key] ?? 0) / (total || 1)) * 100}%` }}
                title={`${splitLabel(v, i, isBoolean)}: ${draft.weights[v.key] ?? 0}%`}
              />
            ) : null,
          )}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-600 tabular-nums">
          <span>0%</span>
          <span>25%</span>
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>

      {/* One row per variant: color + label on the left, weight on the right. */}
      <div className="flex flex-col gap-1.5">
        {variants.map((v, i) => {
          const wErr = errors?.weights?.[v.key];
          return (
            <div key={v.key} className="flex items-center gap-2">
              <span
                className={`size-2.5 shrink-0 rounded-full ${SPLIT_COLORS[i % SPLIT_COLORS.length]}`}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-300">
                {splitLabel(v, i, isBoolean)}
              </span>
              {showWeights ? (
                <>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={String(draft.weights[v.key] ?? 0)}
                    onChange={(e) => setWeight(v.key, Number(e.target.value) || 0)}
                    aria-label={`${splitLabel(v, i, isBoolean)} percent`}
                    className={cn("h-8 w-16 text-right", wErr && ERROR_RING)}
                  />
                  <span className="w-3 text-sm text-zinc-500">%</span>
                </>
              ) : (
                <span className="text-sm text-zinc-400 tabular-nums">
                  {draft.weights[v.key] ?? 0}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Distribute evenly (left) + Show/Hide weights (right), Vercel-style. */}
      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => onChange({ weights: balanceWeights({}, variants) })}
          className="inline-flex items-center gap-1 text-teal-400 transition-colors hover:text-teal-300"
        >
          <Scale className="size-3.5" /> Distribute evenly
        </button>
        <button
          type="button"
          onClick={() => setShowWeights((s) => !s)}
          className="text-zinc-400 transition-colors hover:text-zinc-200"
        >
          {showWeights ? "Hide weights" : "Show weights"}
        </button>
      </div>

      {errors?.total ? <ErrorText>{errors.total}</ErrorText> : null}
      {errors?.form ? <ErrorText>{errors.form}</ErrorText> : null}
    </div>
  );
}

function describeServe(serve: unknown, variants: FlagVariant[]): string {
  const label = (key: string) => {
    const i = variants.findIndex((v) => v.key === key);
    return i >= 0 ? variantLabel(variants[i]!, i) : key;
  };
  if (serve && typeof serve === "object" && "rollout" in serve) {
    const s = serve as { rollout: { variant: string; weight: number }[]; bucketBy?: string };
    const by = s.bucketBy ? ` by ${s.bucketBy}` : "";
    return `a rollout${by} (${s.rollout.map((r) => `${label(r.variant)} ${r.weight}%`).join(", ")})`;
  }
  if (serve && typeof serve === "object" && "progressive" in serve) {
    const p = (serve as { progressive: { variant: string; fallback: string } }).progressive;
    return `a progressive rollout of ${label(p.variant)} (else ${label(p.fallback)})`;
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
