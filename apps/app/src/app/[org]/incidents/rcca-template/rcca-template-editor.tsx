"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, FileCog, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Switch } from "@flagon/design";
import { severityStyle, type SeverityLevel } from "@/lib/incidents";
import type { RccaTemplateData, RccaTemplateField } from "@/lib/rcca-template-api";
import { putRccaTemplateAction } from "./actions";

/** Turn a label into a field key: lowercase, underscore-separated (API key regex). */
function keyify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

type Row = RccaTemplateField & { _edited: boolean };

/**
 * The org RCCA template editor: pick which severities require a postmortem, then
 * shape the fields every RCCA collects. The field key auto-fills from the label
 * until edited (same type-along as the other create forms), and stays stable so
 * existing RCCA values keep mapping. Each incident freezes a copy of this template
 * at declare, so edits here never rewrite past postmortems.
 */
export function RccaTemplateEditor({
  slug,
  template,
  levels,
  canManage,
}: {
  slug: string;
  template: RccaTemplateData;
  levels: SeverityLevel[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [required, setRequired] = useState<string[]>(template.requiredSeverities);
  const [rows, setRows] = useState<Row[]>(() => template.fields.map((f) => ({ ...f, _edited: true })));

  function touch() {
    setSaved(false);
    setError(null);
  }
  function toggleSeverity(value: string) {
    touch();
    setRequired((cur) => (cur.includes(value) ? cur.filter((s) => s !== value) : [...cur, value]));
  }
  function patchRow(i: number, patch: Partial<Row>) {
    touch();
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    touch();
    setRows((cur) => [...cur, { key: "", label: "", description: "", required: false, _edited: false }]);
  }
  function removeRow(i: number) {
    touch();
    setRows((cur) => cur.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    touch();
    setRows((cur) => {
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    const fields = rows
      .map((r) => ({
        key: (r._edited ? r.key : keyify(r.label)).trim(),
        label: r.label.trim(),
        description: r.description?.trim() || undefined,
        required: r.required || undefined,
      }))
      .filter((f) => f.label && f.key);
    if (fields.length === 0) {
      setError("Add at least one field.");
      return;
    }
    const keys = new Set<string>();
    for (const f of fields) {
      if (keys.has(f.key)) {
        setError(`Duplicate field key: ${f.key}.`);
        return;
      }
      keys.add(f.key);
    }
    // Re-sync the local rows to the normalized keys so the inputs reflect what saved.
    setRows(fields.map((f) => ({ ...f, description: f.description ?? "", required: Boolean(f.required), _edited: true })));
    start(async () => {
      const res = await putRccaTemplateAction(slug, { requiredSeverities: required, fields });
      if (res.error) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-zinc-100">
          <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-zinc-300">
            <FileCog className="size-4.5" />
          </span>
          RCCA template
        </h1>
        <p className="text-sm text-zinc-500">
          The postmortem your team fills out after an incident. Each incident freezes a copy of this template when it is declared, so edits here never rewrite past postmortems.
        </p>
      </header>

      {/* Required severities */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium text-zinc-200">Require a postmortem</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Incidents at these severities are flagged until their RCCA is written.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {levels.map((l) => {
            const on = required.includes(l.key);
            const c = severityStyle(l.color);
            return (
              <div
                key={l.key}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                  on ? "border-white/15 bg-white/6" : "border-white/8 bg-white/2"
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <span
                    className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: c.bg, color: c.fg, borderColor: c.border }}
                  >
                    {l.name}
                  </span>
                  <span className={`text-xs ${on ? "text-zinc-300" : "text-zinc-500"}`}>{on ? "Requires RCCA" : "Optional"}</span>
                </span>
                <Switch ariaLabel={`Require RCCA for ${l.name}`} checked={on} onCheckedChange={() => toggleSeverity(l.key)} disabled={!canManage} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Fields */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">Fields</h2>
            <p className="mt-0.5 text-xs text-zinc-500">What every postmortem captures, in order.</p>
          </div>
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={addRow}><Plus className="size-4" /> Add field</Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-10 text-center text-sm text-zinc-500">
            No fields yet. Add one to start the template.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/2">
                {/* Field header: order, number, required, delete */}
                <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button type="button" onClick={() => move(i, -1)} disabled={!canManage || i === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move up">
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={!canManage || i === rows.length - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move down">
                        <ChevronDown className="size-3.5" />
                      </button>
                    </div>
                    <span className="grid size-5 place-items-center rounded bg-white/6 text-[11px] font-medium text-zinc-400 tabular-nums">{i + 1}</span>
                    <span className="truncate text-sm font-medium text-zinc-200">{r.label || <span className="text-zinc-600">Untitled field</span>}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <Switch ariaLabel="Required field" checked={Boolean(r.required)} onCheckedChange={(v) => patchRow(i, { required: v })} disabled={!canManage} />
                      Required
                    </span>
                    {canManage ? (
                      <button type="button" onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400" aria-label="Remove field">
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {/* Field body */}
                <div className="grid gap-3 p-3 sm:grid-cols-[1fr_1fr]">
                  <Field label="Label">
                    <Input
                      value={r.label}
                      onChange={(e) => patchRow(i, { label: e.target.value, key: r._edited ? r.key : keyify(e.target.value) })}
                      placeholder="Root cause"
                      disabled={!canManage}
                    />
                  </Field>
                  <Field label="Key" hint="Stable identifier. Auto-fills from the label.">
                    <Input
                      value={r.key}
                      onChange={(e) => patchRow(i, { key: keyify(e.target.value), _edited: true })}
                      placeholder="root_cause"
                      className="font-mono text-sm"
                      disabled={!canManage}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Description" hint="Optional prompt shown under the field.">
                      <Input
                        value={r.description ?? ""}
                        onChange={(e) => patchRow(i, { description: e.target.value })}
                        placeholder="What actually caused the incident?"
                        disabled={!canManage}
                      />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {canManage ? (
        <div className="flex items-center gap-3 border-t border-white/8 pt-4">
          <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save template"}</Button>
          {saved ? <span className="text-sm text-teal-400">Saved.</span> : <span className="text-xs text-zinc-600">Changes apply to future incidents only.</span>}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Only managers can edit the RCCA template.</p>
      )}
    </div>
  );
}
