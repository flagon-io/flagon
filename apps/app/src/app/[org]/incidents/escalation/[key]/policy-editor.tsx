"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Field, Input, Select, useConfirm } from "@flagon/design";
import { TARGET_TYPES } from "@/lib/incidents";
import type { EscalationPolicyDetail } from "@/lib/oncall-api";
import { deletePolicyAction, setPolicyLevelsAction, updatePolicyAction } from "../../actions";

type Opt = { key: string; name: string };
type OrgMember = { userId: string; name: string };
type LevelDraft = { id: string; targetType: string; targetRef: string; delayMinutes: number; collapsed: boolean };

let idSeq = 0;
function nextId() {
  idSeq += 1;
  return `l${idSeq}`;
}

/**
 * The escalation-policy editor: an ordered ladder of level cards on the left, a
 * details sidebar on the right. Escalation flows top (level 1, paged first) to
 * bottom. Save batches the changed metadata and the levels in one pass, then
 * refreshes in place (it does not navigate away).
 */
export function PolicyEditor({
  slug,
  detail,
  schedules,
  teams,
  orgMembers,
  canManage,
}: {
  slug: string;
  detail: EscalationPolicyDetail;
  schedules: Opt[];
  teams: Opt[];
  orgMembers: OrgMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(detail.policy.name);
  const [repeat, setRepeat] = useState(detail.policy.repeatCount);
  const [levels, setLevels] = useState<LevelDraft[]>(
    detail.levels.map((l) => ({ id: nextId(), targetType: l.targetType, targetRef: l.targetKey, delayMinutes: l.delayMinutes, collapsed: true })),
  );

  const key = detail.policy.key;

  function touch() {
    setSaved(false);
    setError(null);
  }
  function refOptions(type: string) {
    if (type === "schedule") return schedules.map((s) => ({ value: s.key, label: s.name }));
    if (type === "team") return teams.map((t) => ({ value: t.key, label: t.name }));
    return orgMembers.map((m) => ({ value: m.userId, label: m.name }));
  }
  function labelFor(l: LevelDraft) {
    return refOptions(l.targetType).find((o) => o.value === l.targetRef)?.label ?? "";
  }
  function setLevel(id: string, patch: Partial<LevelDraft>) {
    touch();
    setLevels((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch, ...(patch.targetType ? { targetRef: "" } : {}) } : l)));
  }
  function moveLevel(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= levels.length) return;
    touch();
    setLevels((ls) => {
      const next = ls.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function duplicateLevel(i: number) {
    touch();
    setLevels((ls) => {
      const src = ls[i];
      const copy = { ...src, id: nextId(), collapsed: false };
      return [...ls.slice(0, i + 1), copy, ...ls.slice(i + 1)];
    });
  }
  function removeLevel(id: string) {
    touch();
    setLevels((ls) => ls.filter((l) => l.id !== id));
  }
  function addLevel() {
    touch();
    setLevels((ls) => [...ls, { id: nextId(), targetType: "schedule", targetRef: "", delayMinutes: 5, collapsed: false }]);
  }

  function save() {
    setError(null);
    setSaved(false);
    const cleanLevels = levels
      .filter((l) => l.targetRef)
      .map((l) => ({ targetType: l.targetType, targetRef: l.targetRef, delayMinutes: l.delayMinutes }));
    start(async () => {
      const metaChanged = name.trim() !== detail.policy.name || repeat !== detail.policy.repeatCount;
      if (metaChanged) {
        const up = await updatePolicyAction(slug, key, {
          name: name.trim() || detail.policy.name,
          repeatCount: repeat,
        });
        if (up.error) return setError(up.error);
      }
      const res = await setPolicyLevelsAction(slug, key, cleanLevels);
      if (res.error) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete escalation policy?",
      message: `"${detail.policy.name}" and its levels will be removed.`,
      confirmLabel: "Delete policy",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deletePolicyAction(slug, key);
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/escalation`);
    });
  }

  const levelCount = levels.filter((l) => l.targetRef).length;

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}

      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href={`/${slug}/incidents/escalation`} className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> Escalation policies
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">{name || detail.policy.name}</h1>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">{key}</p>
          </div>
          <div className="flex items-center gap-2">
            {saved ? <span className="text-sm text-teal-400">Saved.</span> : null}
            <Button variant="secondary" onClick={() => router.push(`/${slug}/incidents/escalation`)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={pending || !canManage}
              title={canManage ? undefined : "Only organization owners and admins can manage escalation policies."}
            >
              {pending ? "Saving…" : "Save policy"}
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Levels */}
        <section className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Layers className="size-4 text-zinc-500" /> Levels
            </h2>
            <span className="text-xs text-zinc-500">{levelCount} {levelCount === 1 ? "level" : "levels"}</span>
          </div>

          {levels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-10 text-center text-sm text-zinc-500">
              No levels yet. Add the first rung to start the ladder.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {levels.map((l, i) => (
                <LevelCard
                  key={l.id}
                  index={i}
                  total={levels.length}
                  level={l}
                  label={labelFor(l)}
                  refOptions={refOptions(l.targetType)}
                  canManage={canManage}
                  onPatch={(patch) => setLevel(l.id, patch)}
                  onMove={(dir) => moveLevel(i, dir)}
                  onDuplicate={() => duplicateLevel(i)}
                  onRemove={() => removeLevel(l.id)}
                  onToggleCollapse={() => setLevel(l.id, { collapsed: !l.collapsed })}
                />
              ))}
            </div>
          )}

          {canManage ? (
            <div>
              <Button variant="secondary" size="sm" onClick={addLevel}><Plus className="size-4" /> Add level</Button>
            </div>
          ) : null}
        </section>

        {/* Details sidebar */}
        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
            <h2 className="text-sm font-medium text-zinc-200">Details</h2>

            <Field label="Name">
              <Input value={name} onChange={(e) => { touch(); setName(e.target.value); }} placeholder="Sev1 response" disabled={!canManage} />
            </Field>

            <Field label="Key" hint="The policy's stable identifier.">
              <p className="font-mono text-sm text-zinc-400">{key}</p>
            </Field>

            <Field label="Repeat" hint="After the last level, start over from the top to keep paging until someone acknowledges. 0 = stop at the last level.">
              <div className="flex items-center gap-2">
                <Input
                  value={String(repeat)}
                  onChange={(e) => {
                    touch();
                    const n = Number(e.target.value.replace(/[^0-9]/g, "")) || 0;
                    setRepeat(Math.min(10, Math.max(0, n)));
                  }}
                  className="w-16"
                  disabled={!canManage}
                  aria-label="Repeat the ladder N times if still unacknowledged"
                />
                <span className="text-sm text-zinc-500">× if still unacknowledged</span>
              </div>
            </Field>

            <p className="rounded-lg border border-white/8 bg-white/2 px-3 py-2 text-xs/relaxed text-zinc-500">
              How it works: when an incident goes unacknowledged, each level is paged in order after its delay.
            </p>
          </div>

          {canManage ? (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/2 p-4">
              <p className="text-sm font-medium text-zinc-200">Delete policy</p>
              <p className="text-xs text-zinc-500">Removes this ladder and its levels. This cannot be undone.</p>
              <div>
                <Button variant="danger" size="sm" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Delete policy</Button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function LevelCard({
  index,
  total,
  level,
  label,
  refOptions,
  canManage,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
  onToggleCollapse,
}: {
  index: number;
  total: number;
  level: LevelDraft;
  label: string;
  refOptions: { value: string; label: string }[];
  canManage: boolean;
  onPatch: (patch: Partial<LevelDraft>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onToggleCollapse: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/2">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {canManage ? (
          <div className="flex flex-col">
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move level up">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move level down">
              <ChevronDown className="size-3.5" />
            </button>
          </div>
        ) : null}
        <span className="grid size-5 shrink-0 place-items-center rounded bg-white/6 text-[11px] font-medium text-zinc-400 tabular-nums">{index + 1}</span>

        <button type="button" onClick={onToggleCollapse} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={level.collapsed ? "Expand level" : "Collapse level"}>
          {level.collapsed ? <ChevronRight className="size-3.5 shrink-0 text-zinc-600" /> : <ChevronDown className="size-3.5 shrink-0 text-zinc-600" />}
          <span className="shrink-0 text-sm font-medium text-zinc-200">Level {index + 1}</span>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            <span>after {level.delayMinutes} min</span>
            <ArrowRight className="size-3 text-zinc-600" />
            <span className="truncate text-zinc-400">{label ? `page ${label}` : "no target"}</span>
          </span>
        </button>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={onDuplicate} className="grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-zinc-200" aria-label="Duplicate level">
              <Copy className="size-3.5" />
            </button>
            <button type="button" onClick={onRemove} className="grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400" aria-label="Remove level">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {/* Body */}
      {!level.collapsed ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 p-3">
          <Select
            ariaLabel="Target type"
            value={level.targetType}
            onValueChange={(v) => onPatch({ targetType: v })}
            options={TARGET_TYPES}
            fullWidth={false}
            disabled={!canManage}
          />
          <Select
            ariaLabel="Target"
            value={level.targetRef}
            onValueChange={(v) => onPatch({ targetRef: v })}
            placeholder="Choose…"
            options={refOptions}
            className="min-w-40 flex-1"
            disabled={!canManage}
          />
          <div className="inline-flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">after</span>
            <Input
              value={String(level.delayMinutes)}
              onChange={(e) => onPatch({ delayMinutes: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })}
              className="w-16"
              disabled={!canManage}
              aria-label="Delay in minutes"
            />
            <span className="text-xs text-zinc-500">min</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
