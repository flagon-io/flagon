"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookText, GripVertical, Link2, ListChecks, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@flagon/design";
import { SEVERITIES } from "@/lib/incidents";
import type { RunbookDetail } from "@/lib/runbooks-api";
import {
  createRunbookAction,
  deleteRunbookAction,
  setRunbookServicesAction,
  setRunbookStepsAction,
  updateRunbookAction,
} from "../actions";

type Opt = { key: string; name: string };
type StepDraft = { title: string; body: string; kind: string; url: string };
const NONE = "__none__";
const STEP_KINDS = [
  { value: "task", label: "Task" },
  { value: "link", label: "Link" },
];

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export function RunbooksManager({
  slug,
  runbooks,
  projects,
  canManage,
}: {
  slug: string;
  runbooks: RunbookDetail[];
  projects: Opt[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Runbooks</h1>
          <p className="mt-1 text-sm text-zinc-500">Playbooks that become an incident&apos;s checklist. Attach by service or severity.</p>
        </div>
        {canManage ? <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> New runbook</Button> : null}
      </div>

      {runbooks.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300"><BookText className="size-5" /></span>
          <p className="text-base font-medium text-zinc-100">No runbooks</p>
          <p className="max-w-sm text-sm text-zinc-500">Write the steps once. When a matching incident is declared, they land on it as a checklist.</p>
        </div>
      ) : null}

      {creating ? <CreateForm slug={slug} onDone={() => setCreating(false)} /> : null}

      <div className="flex flex-col gap-4">
        {runbooks.map((r) => (
          <RunbookCard key={r.runbook.key} slug={slug} detail={r} projects={projects} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

function CreateForm({ slug, onDone }: { slug: string; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function create() {
    setError(null);
    if (!name.trim()) return setError("Name the runbook.");
    start(async () => {
      const res = await createRunbookAction(slug, { name: name.trim(), key: key.trim() || slugify(name) });
      if (res.error) return setError(res.error);
      onDone();
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => { setName(e.target.value); if (!keyEdited) setKey(slugify(e.target.value)); }} placeholder="Database outage" /></Field>
        <Field label="Key"><Input value={key} onChange={(e) => { setKeyEdited(true); setKey(slugify(e.target.value)); }} placeholder="database-outage" className="font-mono" /></Field>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create"}</Button>
      </div>
    </div>
  );
}

function RunbookCard({
  slug,
  detail,
  projects,
  canManage,
}: {
  slug: string;
  detail: RunbookDetail;
  projects: Opt[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(detail.runbook.triggerSeverity ?? NONE);
  const [services, setServices] = useState<string[]>(detail.runbook.services.map((s) => s.key));
  const [steps, setSteps] = useState<StepDraft[]>(
    detail.steps.map((s) => ({ title: s.title, body: s.body ?? "", kind: s.kind, url: s.url ?? "" })),
  );

  function setStep(i: number, patch: Partial<StepDraft>) {
    setSteps((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function toggleService(key: string) {
    setServices((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));
  }
  function save() {
    setError(null);
    const cleanSteps = steps
      .filter((s) => s.title.trim())
      .map((s) => ({ title: s.title.trim(), body: s.body.trim() || undefined, kind: s.kind, url: s.kind === "link" && s.url.trim() ? s.url.trim() : undefined }));
    start(async () => {
      if (trigger !== (detail.runbook.triggerSeverity ?? NONE)) {
        const up = await updateRunbookAction(slug, detail.runbook.key, { triggerSeverity: trigger === NONE ? null : trigger });
        if (up.error) return setError(up.error);
      }
      const st = await setRunbookStepsAction(slug, detail.runbook.key, cleanSteps);
      if (st.error) return setError(st.error);
      const sv = await setRunbookServicesAction(slug, detail.runbook.key, services);
      if (sv.error) return setError(sv.error);
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      await deleteRunbookAction(slug, detail.runbook.key);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100"><BookText className="size-4 text-zinc-500" /> {detail.runbook.name}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{detail.runbook.key}</p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              Trigger ≥
              <Select ariaLabel="Trigger severity" value={trigger} onValueChange={setTrigger} options={[{ value: NONE, label: "Off" }, ...SEVERITIES.map((s) => ({ value: s.value, label: s.label }))]} />
            </span>
            <button type="button" onClick={remove} disabled={pending} className="text-zinc-500 hover:text-red-400" aria-label="Delete runbook"><Trash2 className="size-4" /></button>
          </div>
        ) : detail.runbook.triggerSeverity ? (
          <span className="text-xs text-zinc-500">Triggers at ≥ {detail.runbook.triggerSeverity.toUpperCase()}</span>
        ) : null}
      </div>

      {/* Services */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-zinc-500">Covers services</p>
        {canManage ? (
          <div className="flex flex-wrap gap-1.5">
            {projects.length === 0 ? <span className="text-xs text-zinc-500">No projects.</span> : null}
            {projects.map((p) => {
              const on = services.includes(p.key);
              return (
                <button key={p.key} type="button" onClick={() => toggleService(p.key)} className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-teal-400/30 bg-teal-400/10 text-teal-200" : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"}`}>{p.name}</button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.runbook.services.length === 0 ? <span className="text-xs text-zinc-500">None.</span> : null}
            {detail.runbook.services.map((s) => <span key={s.key} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">{s.name}</span>)}
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="mt-4">
        <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500"><ListChecks className="size-3.5" /> Steps</p>
        {canManage ? (
          <div className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-lg border border-white/8 bg-white/2 p-2.5">
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 shrink-0 text-zinc-600" />
                  <Input value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder="Step title" className="flex-1" />
                  <Select ariaLabel="Step kind" value={s.kind} onValueChange={(v) => setStep(i, { kind: v })} options={STEP_KINDS} />
                  <button type="button" onClick={() => setSteps((ss) => ss.filter((_, idx) => idx !== i))} className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400" aria-label="Remove step"><Trash2 className="size-4" /></button>
                </div>
                {s.kind === "link" ? (
                  <Input value={s.url} onChange={(e) => setStep(i, { url: e.target.value })} placeholder="https://dashboard…" />
                ) : (
                  <Textarea value={s.body} onChange={(e) => setStep(i, { body: e.target.value })} rows={2} placeholder="Instructions (markdown)…" />
                )}
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setSteps((ss) => [...ss, { title: "", body: "", kind: "task", url: "" }])}><Plus className="size-4" /> Add step</Button>
            </div>
          </div>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {detail.steps.map((s) => (
              <li key={s.position} className="flex items-start gap-2 text-sm text-zinc-300">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-white/5 text-[10px] text-zinc-400">{s.position + 1}</span>
                {s.kind === "link" && s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-teal-400 hover:text-teal-300"><Link2 className="size-3.5" /> {s.title}</a>
                ) : (
                  <span>{s.title}</span>
                )}
              </li>
            ))}
          </ol>
        )}
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {canManage ? (
          <div className="mt-3"><Button variant="secondary" size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save runbook"}</Button></div>
        ) : null}
      </div>
    </div>
  );
}
