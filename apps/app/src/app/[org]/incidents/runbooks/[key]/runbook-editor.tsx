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
import { Button, Field, Input, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Select, Textarea, useConfirm } from "@flagon/design";
import { SEVERITIES } from "@/lib/incidents";
import type { RunbookDetail } from "@/lib/runbooks-api";
import {
  deleteRunbookAction,
  setRunbookStepsAction,
  updateRunbookAction,
} from "../../actions";

type StepDraft = { id: string; title: string; body: string; kind: string; url: string; collapsed: boolean };
const NONE = "__none__";
const STEP_KINDS = [
  { value: "task", label: "Task" },
  { value: "link", label: "Link" },
];
// Honest checklist scaffolding (not automations — those arrive with integrations).
// These prefill a task title so common incident work is one click away.
const STEP_TEMPLATES = [
  "Assign an incident commander",
  "Open a comms channel (war room)",
  "Notify affected stakeholders",
  "Capture impact and a running timeline",
  "Roll back the most recent deploy",
  "Update the status page",
  "Start the postmortem",
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
  canManage,
}: {
  slug: string;
  detail: RunbookDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(detail.runbook.name);
  const [description, setDescription] = useState(detail.runbook.description ?? "");
  const [trigger, setTrigger] = useState(detail.runbook.triggerSeverity ?? NONE);
  const [steps, setSteps] = useState<StepDraft[]>(
    detail.steps.map((s) => ({ id: nextId(), title: s.title, body: s.body ?? "", kind: s.kind, url: s.url ?? "", collapsed: true })),
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
  function addStep(kind: string = "task", title = "") {
    touch();
    setSteps((ss) => [...ss, { id: nextId(), title, body: "", kind, url: "", collapsed: false }]);
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
      }));
    start(async () => {
      const nextTrigger = trigger === NONE ? null : trigger;
      const metaChanged =
        name.trim() !== detail.runbook.name ||
        (description.trim() || null) !== (detail.runbook.description ?? null) ||
        nextTrigger !== (detail.runbook.triggerSeverity ?? null);
      if (metaChanged) {
        const up = await updateRunbookAction(slug, key, {
          name: name.trim() || detail.runbook.name,
          description: description.trim() || null,
          triggerSeverity: nextTrigger,
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
            <Menu>
              <MenuTrigger asChild>
                <Button variant="secondary" size="sm">
                  <Plus className="size-4" /> Add step <ChevronDown className="size-3.5" />
                </Button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuLabel>Blank</MenuLabel>
                <MenuItem onSelect={() => addStep("task")}><ListChecks className="size-3.5" /> Task</MenuItem>
                <MenuItem onSelect={() => addStep("link")}><Link2 className="size-3.5" /> Link</MenuItem>
                <MenuSeparator />
                <MenuLabel>From a template</MenuLabel>
                {STEP_TEMPLATES.map((t) => (
                  <MenuItem key={t} onSelect={() => addStep("task", t)}>{t}</MenuItem>
                ))}
              </MenuContent>
            </Menu>
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

            <Field label="Trigger severity" hint="Attaches automatically at or above this severity.">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-500">≥</span>
                <Select
                  ariaLabel="Trigger severity"
                  value={trigger}
                  onValueChange={(v) => { touch(); setTrigger(v); }}
                  options={[{ value: NONE, label: "Off (manual)" }, ...SEVERITIES.map((s) => ({ value: s.value, label: s.label }))]}
                  disabled={!canManage}
                />
              </div>
            </Field>

            <p className="rounded-lg border border-white/8 bg-white/2 px-3 py-2 text-xs/relaxed text-zinc-500">
              When it runs: with a trigger severity set, it attaches automatically to any incident at or above that severity. You can also attach it to any incident by hand from the incident page.
            </p>
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

        <button type="button" onClick={onToggleCollapse} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={step.collapsed ? "Expand step" : "Collapse step"}>
          {step.collapsed ? <ChevronRight className="size-3.5 shrink-0 text-zinc-600" /> : <ChevronDown className="size-3.5 shrink-0 text-zinc-600" />}
          <span className="truncate text-sm font-medium text-zinc-200">{step.title || <span className="text-zinc-600">Untitled step</span>}</span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
            {step.kind === "link" ? <Link2 className="size-3" /> : null}
            {step.kind === "link" ? "Link" : "Task"}
          </span>
          {step.collapsed && preview ? <span className="truncate text-xs text-zinc-600">{preview}</span> : null}
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
        </div>
      ) : null}
    </div>
  );
}
