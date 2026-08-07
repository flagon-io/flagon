"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select, Switch } from "@flagon/design";
import type { Objective } from "@/lib/objectives-api";
import { createObjectiveAction, deleteObjectiveAction, updateObjectiveAction } from "./actions";

type Opt = { key: string; name: string };
const WINDOWS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function keyify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/**
 * Reliability objectives (optional SLO/SLA). Deliberately un-pushy: the empty state
 * states the option without nudging. Each objective is a target % over a window, scoped
 * to the whole platform or one project, labelled however the org frames it.
 */
export function ObjectivesManager({ slug, objectives, projects, canManage }: { slug: string; objectives: Objective[]; projects: Opt[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Objective | null>(null);
  const [creating, setCreating] = useState(false);

  function toggleEnabled(o: Objective) {
    start(async () => {
      await updateObjectiveAction(slug, o.key, { enabled: !o.enabled });
      router.refresh();
    });
  }
  function remove(o: Objective) {
    start(async () => {
      await deleteObjectiveAction(slug, o.key);
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-zinc-100">
            <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-zinc-300"><Target className="size-4.5" /></span>
            Objectives
          </h1>
          <p className="text-sm text-zinc-500">
            Optional reliability targets. Define an SLO or SLA if you want one, framed however you like. With none defined, the Uptime view simply shows measured uptime.
          </p>
        </div>
        {canManage ? (
          <Button variant="secondary" onClick={() => setCreating(true)}><Plus className="size-4" /> Add objective</Button>
        ) : null}
      </header>

      {objectives.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-12 text-center text-sm text-zinc-500">
          No objectives defined.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {objectives.map((o) => (
            <div key={o.key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-4 py-3">
              <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">{o.label}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{o.name}</p>
                <p className="text-xs text-zinc-500">
                  {o.targetPct}% over {o.windowDays}d · {o.scopeType === "project" ? (o.scopeProjectKey ?? "project") : "whole platform"}
                </p>
              </div>
              {canManage ? (
                <>
                  <Switch ariaLabel={`Enable ${o.name}`} checked={o.enabled} onCheckedChange={() => toggleEnabled(o)} disabled={pending} />
                  <button type="button" onClick={() => setEditing(o)} className="text-zinc-500 hover:text-zinc-200" aria-label="Edit"><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => remove(o)} className="text-zinc-600 hover:text-red-400" aria-label="Delete"><Trash2 className="size-4" /></button>
                </>
              ) : (
                <span className={`text-xs ${o.enabled ? "text-teal-400" : "text-zinc-600"}`}>{o.enabled ? "Active" : "Off"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {creating ? <ObjectiveModal slug={slug} projects={projects} onClose={() => setCreating(false)} /> : null}
      {editing ? <ObjectiveModal slug={slug} projects={projects} existing={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ObjectiveModal({ slug, projects, existing, onClose }: { slug: string; projects: Opt[]; existing?: Objective; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(existing?.name ?? "");
  const [label, setLabel] = useState(existing?.label ?? "SLO");
  const [scopeType, setScopeType] = useState<"org" | "project">(existing?.scopeType ?? "org");
  const [projectKey, setProjectKey] = useState(existing?.scopeProjectKey ?? projects[0]?.key ?? "");
  const [targetPct, setTargetPct] = useState(String(existing?.targetPct ?? 99.9));
  const [windowDays, setWindowDays] = useState(String(existing?.windowDays ?? 30));

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the objective a name.");
    if (scopeType === "project" && !projectKey) return setError("Pick a project to scope to.");
    const body = {
      name: name.trim(),
      label: label.trim() || "SLO",
      scopeType,
      projectKey: scopeType === "project" ? projectKey : null,
      targetPct: Math.max(0, Math.min(100, Number(targetPct) || 0)),
      windowDays: Number(windowDays),
    };
    start(async () => {
      const res = existing
        ? await updateObjectiveAction(slug, existing.key, body)
        : await createObjectiveAction(slug, { key: keyify(name), ...body });
      if (res.error) return setError(res.error);
      router.refresh();
      onClose();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title={existing ? "Edit objective" : "New objective"} description="A target uptime over a rolling window, scoped to the platform or one project." onClose={onClose} />
      <ModalBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout availability" autoFocus />
          </Field>
          <Field label="Label" hint="Your framing.">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="SLO" className="w-28" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target uptime">
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={100} step={0.1} value={targetPct} onChange={(e) => setTargetPct(e.target.value)} className="w-28" />
              <span className="text-sm text-zinc-500">%</span>
            </div>
          </Field>
          <Field label="Window">
            <Select ariaLabel="Window" value={windowDays} onValueChange={setWindowDays} className="w-full" options={WINDOWS} />
          </Field>
        </div>
        <Field label="Scope">
          <Select ariaLabel="Scope" value={scopeType} onValueChange={(v) => setScopeType(v as "org" | "project")} className="w-full" options={[{ value: "org", label: "Whole platform" }, { value: "project", label: "A single project" }]} />
        </Field>
        {scopeType === "project" ? (
          <Field label="Project">
            {projects.length === 0 ? (
              <p className="text-sm text-zinc-500">No projects yet.</p>
            ) : (
              <Select ariaLabel="Project" value={projectKey} onValueChange={setProjectKey} className="w-full" options={projects.map((p) => ({ value: p.key, label: p.name }))} />
            )}
          </Field>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={pending || !name.trim()}>{pending ? "Saving…" : existing ? "Save" : "Create"}</Button>
      </ModalFooter>
    </Modal>
  );
}
