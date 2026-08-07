"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, SignalHigh, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Switch } from "@flagon/design";
import { severityStyle, type PlatformMode, type SeverityLevel } from "@/lib/incidents";
import { putSeverityLevelsAction } from "./actions";

/** Turn a name into a stable key: lowercase, underscore-separated (API key regex). */
function keyify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

const PALETTE = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#22c55e", "#14b8a6", "#38bdf8", "#6366f1", "#a855f7", "#ec4899", "#a1a1aa"];

const PLATFORM_OPTIONS: { value: PlatformMode; label: string }[] = [
  { value: "full", label: "Full platform" },
  { value: "proportional", label: "Proportional to affected services" },
  { value: "none", label: "None (service only)" },
];
function platformHint(mode: PlatformMode): string {
  if (mode === "full") return "Counts as full platform downtime.";
  if (mode === "proportional") return "Counts against the platform by affected services / total.";
  return "Never moves the platform total (still dents the affected service).";
}

type Row = {
  key: string;
  name: string;
  description: string;
  color: string;
  serviceImpactPct: number;
  platformMode: PlatformMode;
  isDefault: boolean;
  _isNew: boolean;
};

function toRow(l: SeverityLevel): Row {
  return { key: l.key, name: l.name, description: l.description ?? "", color: l.color, serviceImpactPct: Math.round(l.downtimeWeight * 100), platformMode: l.platformMode, isDefault: l.isDefault, _isNew: false };
}

/**
 * The org severity ladder editor. Each level carries two independent impact knobs:
 * SERVICE impact (how much an incident dents the affected project's uptime) and
 * PLATFORM impact (how it rolls into the global total). A level can count fully against
 * a service yet nothing against the platform. Saved as one ordered ladder; a removed
 * level is archived, so past incidents keep their severity.
 */
export function SeveritiesManager({ slug, levels, canManage }: { slug: string; levels: SeverityLevel[]; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => levels.map(toRow));

  function touch() {
    setSaved(false);
    setError(null);
  }
  function patch(i: number, p: Partial<Row>) {
    touch();
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function setDefault(i: number) {
    touch();
    setRows((cur) => cur.map((r, idx) => ({ ...r, isDefault: idx === i })));
  }
  function addRow() {
    touch();
    setRows((cur) => [...cur, { key: "", name: "", description: "", color: PALETTE[cur.length % PALETTE.length], serviceImpactPct: 50, platformMode: "proportional", isDefault: cur.length === 0, _isNew: true }]);
  }
  function removeRow(i: number) {
    touch();
    setRows((cur) => {
      const next = cur.filter((_, idx) => idx !== i);
      if (next.length && !next.some((r) => r.isDefault)) next[0].isDefault = true;
      return next;
    });
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
    const prepared = rows.map((r) => ({
      key: (r._isNew ? keyify(r.key || r.name) : r.key).trim(),
      name: r.name.trim(),
      description: r.description.trim() || null,
      color: r.color,
      downtimeWeight: Math.max(0, Math.min(1, r.serviceImpactPct / 100)),
      platformMode: r.platformMode,
      isDefault: r.isDefault,
    }));
    if (prepared.length === 0) return setError("Keep at least one severity level.");
    for (const p of prepared) {
      if (!p.name) return setError("Every level needs a name.");
      if (!p.key) return setError(`Give "${p.name}" a key.`);
    }
    const keys = new Set<string>();
    for (const p of prepared) {
      if (keys.has(p.key)) return setError(`Duplicate key: ${p.key}.`);
      keys.add(p.key);
    }
    if (prepared.filter((p) => p.isDefault).length !== 1) return setError("Pick exactly one default level.");

    const payload = prepared.map((p, i) => ({ ...p, rank: i }));
    setRows(payload.map((p) => ({ key: p.key, name: p.name, description: p.description ?? "", color: p.color, serviceImpactPct: Math.round(p.downtimeWeight * 100), platformMode: p.platformMode, isDefault: p.isDefault, _isNew: false })));
    start(async () => {
      const res = await putSeverityLevelsAction(slug, payload);
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
            <SignalHigh className="size-4.5" />
          </span>
          Severity levels
        </h1>
        <p className="text-sm text-zinc-500">
          Name your own ladder and set two independent impacts per level: <span className="text-zinc-300">service</span> (how much it dents the affected project&apos;s uptime) and <span className="text-zinc-300">platform</span> (how it rolls into the global total). A level can count fully against a service yet nothing against the platform.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const s = severityStyle(r.color);
          return (
            <div key={i} className="rounded-xl border border-white/10 bg-white/2">
              <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button type="button" onClick={() => move(i, -1)} disabled={!canManage || i === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move up"><ChevronUp className="size-3.5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={!canManage || i === rows.length - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move down"><ChevronDown className="size-3.5" /></button>
                  </div>
                  <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}>{r.name || "New"}</span>
                  <span className="font-mono text-xs text-zinc-600">{r._isNew ? keyify(r.key || r.name) || "key" : r.key}</span>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                    <input type="radio" name="default-severity" checked={r.isDefault} onChange={() => setDefault(i)} disabled={!canManage} className="accent-teal-400" />
                    Default
                  </label>
                  {canManage && rows.length > 1 ? (
                    <button type="button" onClick={() => removeRow(i)} className="text-zinc-600 hover:text-red-400" aria-label="Remove level"><Trash2 className="size-4" /></button>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-3 p-3 sm:grid-cols-2">
                <Field label="Name">
                  <Input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="P0 / SEV1" disabled={!canManage} />
                </Field>
                <Field label="Key" hint={r._isNew ? "Auto-fills from the name. Immutable once saved." : "Immutable."}>
                  <Input value={r._isNew ? r.key : r.key} onChange={(e) => patch(i, { key: keyify(e.target.value) })} placeholder="p0" className="font-mono text-sm" disabled={!canManage || !r._isNew} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Description" hint="Shown wherever this level is used.">
                    <Input value={r.description} onChange={(e) => patch(i, { description: e.target.value })} placeholder="Critical: full outage or severe customer impact." disabled={!canManage} />
                  </Field>
                </div>
                <Field label="Service impact" hint="How much it counts against the affected project's uptime.">
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} max={100} step={5} value={String(r.serviceImpactPct)} onChange={(e) => patch(i, { serviceImpactPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} disabled={!canManage} className="w-24" />
                    <span className="text-sm text-zinc-500">%</span>
                  </div>
                </Field>
                <Field label="Platform impact" hint={platformHint(r.platformMode)}>
                  <Select ariaLabel="Platform impact" value={r.platformMode} onValueChange={(v) => patch(i, { platformMode: v as PlatformMode })} className="w-full" options={PLATFORM_OPTIONS} disabled={!canManage} />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Color">
                    <div className="flex flex-wrap gap-1.5">
                      {PALETTE.map((c) => (
                        <button key={c} type="button" onClick={() => patch(i, { color: c })} disabled={!canManage} aria-label={`Color ${c}`} aria-pressed={r.color.toLowerCase() === c} className={`size-6 rounded-full border transition-transform ${r.color.toLowerCase() === c ? "border-white/60 scale-110" : "border-white/10 hover:scale-105"}`} style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          );
        })}

        {canManage ? (
          <Button variant="secondary" size="sm" onClick={addRow} className="w-fit"><Plus className="size-4" /> Add level</Button>
        ) : null}
      </section>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {canManage ? (
        <div className="flex items-center gap-3 border-t border-white/8 pt-4">
          <Button variant="primary" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save ladder"}</Button>
          {saved ? <span className="text-sm text-teal-400">Saved.</span> : <span className="text-xs text-zinc-600">Removing a level archives it; past incidents keep their severity.</span>}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Only managers can edit severity levels.</p>
      )}
    </div>
  );
}
