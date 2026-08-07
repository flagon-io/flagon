"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Link2,
  ListChecks,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Field, Input, Menu, MenuContent, MenuItem, MenuTrigger, SegmentedControl, Select, Textarea, useConfirm } from "@flagon/design";
import { STATUSES, type SeverityLevel } from "@/lib/incidents";
import type { RunbookDetail } from "@/lib/runbooks-api";
import type { CatalogProvider, StepCondition } from "@/lib/runbook-steps";
import { AddStepModal } from "./add-step-modal";
import {
  deleteRunbookAction,
  setRunbookStepsAction,
  updateRunbookAction,
} from "../../actions";

type StepDraft = {
  id: string;
  title: string;
  body: string;
  kind: string;
  url: string;
  provider: string;
  action: string;
  conditions: StepCondition[];
  collapsed: boolean;
};
const STEP_KINDS = [
  { value: "task", label: "Task" },
  { value: "link", label: "Link" },
];

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `s${idSeq}`;
}

/**
 * The runbook editor: an ordered list of step cards on the left, a details sidebar
 * on the right. Save batches the changed metadata, the steps, and the covered
 * services in one pass, then refreshes in place (it does not navigate away).
 */
export function RunbookEditor({
  slug,
  detail,
  levels,
  canManage,
  catalog,
}: {
  slug: string;
  detail: RunbookDetail;
  levels: SeverityLevel[];
  canManage: boolean;
  /** The org's integrations catalog, for deriving + gating runbook step providers. */
  catalog: CatalogProvider[];
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [name, setName] = useState(detail.runbook.name);
  const [description, setDescription] = useState(detail.runbook.description ?? "");
  const [manualOnly, setManualOnly] = useState(detail.runbook.manualOnly);
  // Attach conditions are severity-only for now; empty = every incident.
  const [attachSeverities, setAttachSeverities] = useState<string[]>(
    detail.runbook.attachConditions.flatMap((c) => c.values),
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    detail.steps.map((s) => ({ id: nextId(), title: s.title, body: s.body ?? "", kind: s.kind, url: s.url ?? "", provider: s.provider, action: s.action, conditions: s.conditions ?? [], collapsed: true })),
  );

  const key = detail.runbook.key;

  function touch() {
    setSaved(false);
    setError(null);
  }
  function setStep(id: string, patch: Partial<StepDraft>) {
    touch();
    setSteps((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function moveStep(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    touch();
    setSteps((ss) => {
      const next = ss.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function duplicateStep(i: number) {
    touch();
    setSteps((ss) => {
      const src = ss[i];
      const copy = { ...src, id: nextId(), title: src.title ? `${src.title} (copy)` : "", collapsed: false };
      return [...ss.slice(0, i + 1), copy, ...ss.slice(i + 1)];
    });
  }
  function removeStep(id: string) {
    touch();
    setSteps((ss) => ss.filter((s) => s.id !== id));
  }
  function addStep(step: {
    kind?: string;
    title?: string;
    provider?: string;
    action?: string;
    conditions?: StepCondition[];
  }) {
    touch();
    setSteps((ss) => [
      ...ss,
      {
        id: nextId(),
        title: step.title ?? "",
        body: "",
        kind: step.kind ?? "task",
        url: "",
        provider: step.provider ?? "core",
        action: step.action ?? "task",
        conditions: step.conditions ?? [],
        collapsed: false,
      },
    ]);
  }

  function save() {
    setError(null);
    setSaved(false);
    const cleanSteps = steps
      .filter((s) => s.title.trim())
      .map((s) => ({
        title: s.title.trim(),
        body: s.body.trim() || undefined,
        kind: s.kind,
        url: s.kind === "link" && s.url.trim() ? s.url.trim() : undefined,
        provider: s.provider,
        action: s.action,
        // Drop empty severity/milestone conditions so a half-filled row never persists.
        conditions: s.conditions.filter(
          (c) => c.type === "previous_step" || c.values.length > 0,
        ),
      }));
    start(async () => {
      const attachConditions = attachSeverities.length
        ? [{ type: "severity" as const, values: attachSeverities }]
        : [];
      const prevSeverities = detail.runbook.attachConditions.flatMap((c) => c.values);
      const metaChanged =
        name.trim() !== detail.runbook.name ||
        (description.trim() || null) !== (detail.runbook.description ?? null) ||
        manualOnly !== detail.runbook.manualOnly ||
        attachSeverities.join(",") !== prevSeverities.join(",");
      if (metaChanged) {
        const up = await updateRunbookAction(slug, key, {
          name: name.trim() || detail.runbook.name,
          description: description.trim() || null,
          manualOnly,
          attachConditions,
        });
        if (up.error) return setError(up.error);
      }
      const st = await setRunbookStepsAction(slug, key, cleanSteps);
      if (st.error) return setError(st.error);
      setSaved(true);
      router.refresh();
    });
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete runbook?",
      message: `"${detail.runbook.name}" and its steps will be removed. Incidents that already attached it keep their checklist.`,
      confirmLabel: "Delete runbook",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteRunbookAction(slug, key);
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/runbooks`);
    });
  }

  const stepCount = steps.filter((s) => s.title.trim()).length;

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}
      {addOpen ? (
        <AddStepModal
          slug={slug}
          catalog={catalog}
          onAdd={(step) =>
            addStep({
              kind: step.persistAs === "link" ? "link" : "task",
              title: step.defaultTitle ?? "",
              // Native steps only are addable today, so provider is "core"; the
              // action is the catalog step key (e.g. "start-retro").
              provider: "core",
              action: step.key,
              conditions: step.defaultConditions ?? [],
            })
          }
          onClose={() => setAddOpen(false)}
        />
      ) : null}

      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href={`/${slug}/incidents/runbooks`} className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> Runbooks
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">{name || detail.runbook.name}</h1>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">{key}</p>
          </div>
          <div className="flex items-center gap-2">
            {saved ? <span className="text-sm text-teal-400">Saved.</span> : null}
            <Button variant="secondary" onClick={() => router.push(`/${slug}/incidents/runbooks`)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={pending || !canManage}
              title={canManage ? undefined : "Only organization owners and admins can manage runbooks."}
            >
              {pending ? "Saving…" : "Save runbook"}
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Steps */}
        <section className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
              <ListChecks className="size-4 text-zinc-500" /> Steps
            </h2>
            <span className="text-xs text-zinc-500">{stepCount} {stepCount === 1 ? "step" : "steps"}</span>
          </div>

          {steps.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-10 text-center text-sm text-zinc-500">
              No steps yet. Add the first one to build the checklist.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {steps.map((s, i) => (
                <StepCard
                  key={s.id}
                  index={i}
                  total={steps.length}
                  step={s}
                  levels={levels}
                  canManage={canManage}
                  onPatch={(patch) => setStep(s.id, patch)}
                  onMove={(dir) => moveStep(i, dir)}
                  onDuplicate={() => duplicateStep(i)}
                  onRemove={() => removeStep(s.id)}
                  onToggleCollapse={() => setStep(s.id, { collapsed: !s.collapsed })}
                />
              ))}
            </div>
          )}

          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add step
            </Button>
          ) : null}
        </section>

        {/* Details sidebar */}
        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
            <h2 className="text-sm font-medium text-zinc-200">Details</h2>

            <Field label="Name">
              <Input value={name} onChange={(e) => { touch(); setName(e.target.value); }} placeholder="Database outage" disabled={!canManage} />
            </Field>

            <Field label="Key" hint="The runbook's stable identifier.">
              <p className="font-mono text-sm text-zinc-400">{key}</p>
            </Field>

            <Field label="Description">
              <Textarea value={description} onChange={(e) => { touch(); setDescription(e.target.value); }} rows={3} placeholder="When and why to run this." disabled={!canManage} />
            </Field>

            <Field label="Attachment">
              <div className={!canManage ? "pointer-events-none opacity-60" : ""}>
                <SegmentedControl
                  ariaLabel="Attachment"
                  value={manualOnly ? "manual" : "auto"}
                  onValueChange={(v) => { touch(); setManualOnly(v === "manual"); }}
                  options={[
                    { value: "auto", label: "Automatic" },
                    { value: "manual", label: "Manual only" },
                  ]}
                />
              </div>
            </Field>

            {manualOnly ? (
              <p className="rounded-lg border border-white/8 bg-white/2 px-3 py-2 text-xs/relaxed text-zinc-500">
                Only attaches when a responder adds it to an incident by hand.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-500">
                  {attachSeverities.length === 0
                    ? "Attaches to every incident."
                    : "Attaches only to incidents at these severities:"}
                </p>
                <ChipMultiSelect
                  options={levels.map((l) => ({ value: l.key, label: l.name }))}
                  selected={attachSeverities}
                  disabled={!canManage}
                  onChange={(vals) => { touch(); setAttachSeverities(vals); }}
                />
                <p className="text-[11px] text-zinc-600">Leave all unselected to attach to every incident.</p>
              </div>
            )}
          </div>

          {canManage ? (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/2 p-4">
              <p className="text-sm font-medium text-zinc-200">Delete runbook</p>
              <p className="text-xs text-zinc-500">Removes this playbook. Incidents that already attached it keep their checklist.</p>
              <div>
                <Button variant="danger" size="sm" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Delete runbook</Button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function StepCard({
  index,
  total,
  step,
  levels,
  canManage,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onToggleCollapse,
}: {
  index: number;
  total: number;
  step: StepDraft;
  levels: SeverityLevel[];
  canManage: boolean;
  onPatch: (patch: Partial<StepDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleCollapse: () => void;
}) {
  const preview = step.kind === "link" ? step.url : step.body.split("\n")[0];
  return (
    <div className="rounded-xl border border-white/10 bg-white/2">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {canManage ? (
          <div className="flex flex-col">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move step up">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move step down">
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        ) : null}
        <span className="grid size-5 shrink-0 place-items-center rounded bg-white/6 text-[11px] font-medium text-zinc-400 tabular-nums">{index + 1}</span>

        <button type="button" onClick={onToggleCollapse} className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-label={step.collapsed ? "Expand step" : "Collapse step"}>
          {step.collapsed ? <ChevronRight className="mt-1 size-3.5 shrink-0 text-zinc-600" /> : <ChevronDown className="mt-1 size-3.5 shrink-0 text-zinc-600" />}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-zinc-200">{step.title || <span className="text-zinc-600">Untitled step</span>}</span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                {step.kind === "link" ? <Link2 className="size-3" /> : null}
                {step.kind === "link" ? "Link" : "Task"}
              </span>
              {step.collapsed && preview ? <span className="truncate text-xs text-zinc-600">{preview}</span> : null}
            </span>
            {/* FireHydrant-style execution line: green "Automatic when runbook added",
                then any conditional criteria. */}
            <span className="mt-0.5 block truncate text-xs">
              <span className="text-teal-500/90">Automatic</span>
              <span className="text-zinc-500"> {describeConditions(step.conditions, levels)}</span>
            </span>
          </span>
        </button>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onDuplicate} className="grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-200" aria-label="Duplicate step">
              <Copy className="size-3.5" />
            </button>
            <button type="button" onClick={onRemove} className="grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400" aria-label="Remove step">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Body */}
      {!step.collapsed ? (
        <div className="flex flex-col gap-3 border-t border-white/8 p-3">
          <div className="flex items-center gap-2">
            <Input value={step.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Step title" className="flex-1" disabled={!canManage} />
            <Select ariaLabel="Step kind" value={step.kind} onValueChange={(v) => onPatch({ kind: v })} options={STEP_KINDS} fullWidth={false} disabled={!canManage} />
          </div>
          {step.kind === "link" ? (
            <Input value={step.url} onChange={(e) => onPatch({ url: e.target.value })} placeholder="https://dashboard.example.com" disabled={!canManage} />
          ) : (
            <Textarea value={step.body} onChange={(e) => onPatch({ body: e.target.value })} rows={3} placeholder="Instructions (markdown)…" disabled={!canManage} />
          )}

          <StepConditionsEditor
            conditions={step.conditions}
            levels={levels}
            canManage={canManage}
            onChange={(conditions) => onPatch({ conditions })}
          />
        </div>
      ) : null}
    </div>
  );
}

/** The severity/status keys used across a step's conditions and its summary. */
function labelForKey(options: { value: string; label: string }[], key: string): string {
  return options.find((o) => o.value === key)?.label ?? key;
}

/**
 * A one-line, human summary of when a step runs, e.g. "when the runbook is added"
 * or "when milestone is Resolved and severity is SEV1, SEV2". Powers the collapsed
 * card line so the execution model reads at a glance.
 */
function describeConditions(conditions: StepCondition[], levels: SeverityLevel[]): string {
  if (conditions.length === 0) return "when the runbook is added";
  const sevOptions = levels.map((l) => ({ value: l.key, label: l.name }));
  const parts = conditions.map((c) => {
    if (c.type === "previous_step") return "the previous step is done";
    if (c.type === "milestone") {
      return `milestone is ${c.values.map((v) => labelForKey(STATUSES, v)).join(", ") || "…"}`;
    }
    return `severity is ${c.values.map((v) => labelForKey(sevOptions, v)).join(", ") || "…"}`;
  });
  return `when ${parts.join(" and ")}`;
}

const CONDITION_LABELS: Record<StepCondition["type"], string> = {
  milestone: "Milestone",
  severity: "Severity",
  previous_step: "Previous step is done",
};

/** Per-step FireHydrant-style condition builder: add conditions, pick their values. */
function StepConditionsEditor({
  conditions,
  levels,
  canManage,
  onChange,
}: {
  conditions: StepCondition[];
  levels: SeverityLevel[];
  canManage: boolean;
  onChange: (conditions: StepCondition[]) => void;
}) {
  const sevOptions = levels.map((l) => ({ value: l.key, label: l.name }));
  const hasType = (t: StepCondition["type"]) => conditions.some((c) => c.type === t);

  function add(type: StepCondition["type"]) {
    const next: StepCondition =
      type === "previous_step" ? { type } : { type, values: [] };
    onChange([...conditions, next]);
  }
  function removeAt(i: number) {
    onChange(conditions.filter((_, j) => j !== i));
  }
  function setValues(i: number, values: string[]) {
    onChange(conditions.map((c, j) => (j === i && c.type !== "previous_step" ? { ...c, values } : c)));
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-white/8 bg-white/2 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">Runs when</span>
        {conditions.length === 0 ? (
          <span className="text-xs text-zinc-500">the runbook is added</span>
        ) : null}
      </div>

      {conditions.map((c, i) => (
        <div key={`${c.type}-${i}`} className="flex items-start gap-2">
          <span className="mt-1.5 w-24 shrink-0 text-xs text-zinc-500">{CONDITION_LABELS[c.type]}</span>
          <div className="min-w-0 flex-1">
            {c.type === "previous_step" ? (
              <p className="py-1 text-xs text-zinc-400">The step above this one has completed.</p>
            ) : (
              <ChipMultiSelect
                options={c.type === "milestone" ? STATUSES : sevOptions}
                selected={c.values}
                disabled={!canManage}
                onChange={(vals) => setValues(i, vals)}
              />
            )}
          </div>
          {canManage ? (
            <button type="button" onClick={() => removeAt(i)} className="mt-0.5 grid size-6 shrink-0 place-items-center rounded text-zinc-600 hover:bg-white/5 hover:text-red-400" aria-label="Remove condition">
              <Trash2 className="size-3.5" />
            </button>
          ) : null}
        </div>
      ))}

      {canManage ? (
        <Menu>
          <MenuTrigger asChild>
            <button type="button" className="mt-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-teal-500 hover:text-teal-400">
              <Plus className="size-3.5" /> Add condition
            </button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuItem onSelect={() => add("milestone")} disabled={hasType("milestone")}>Milestone is…</MenuItem>
            <MenuItem onSelect={() => add("severity")} disabled={hasType("severity")}>Severity is…</MenuItem>
            <MenuItem onSelect={() => add("previous_step")} disabled={hasType("previous_step")}>Previous step is done</MenuItem>
          </MenuContent>
        </Menu>
      ) : null}
    </div>
  );
}

/** A compact multi-select rendered as toggleable chips (used for condition values). */
function ChipMultiSelect({
  options,
  selected,
  disabled,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  disabled: boolean;
  onChange: (values: string[]) => void;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  return (
    <div className="flex flex-wrap gap-1.5 py-0.5">
      {options.map((o) => {
        const on = selected.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o.value)}
            className={`rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-60 ${
              on
                ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                : "border-white/10 bg-white/5 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
