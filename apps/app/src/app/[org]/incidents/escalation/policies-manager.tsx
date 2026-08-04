"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Workflow } from "lucide-react";
import { Button, Field, Input, Select } from "@flagon/design";
import { TARGET_TYPES } from "@/lib/incidents";
import type { EscalationPolicyDetail } from "@/lib/oncall-api";
import { createPolicyAction, deletePolicyAction, setPolicyLevelsAction, updatePolicyAction } from "../actions";

type Opt = { key: string; name: string };
type OrgMember = { userId: string; name: string };
type LevelDraft = { targetType: string; targetRef: string; delayMinutes: number };

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

export function PoliciesManager({
  slug,
  policies,
  schedules,
  teams,
  orgMembers,
  canManage,
}: {
  slug: string;
  policies: EscalationPolicyDetail[];
  schedules: Opt[];
  teams: Opt[];
  orgMembers: OrgMember[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Escalation policies</h1>
          <p className="mt-1 text-sm text-zinc-500">Who gets paged, and after how long, when an incident goes unacknowledged.</p>
        </div>
        {canManage ? <Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-4" /> New policy</Button> : null}
      </div>

      {policies.length === 0 && !creating ? (
        <p className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-12 text-center text-sm text-zinc-500">No policies yet. Create one and add escalation levels.</p>
      ) : null}

      {creating ? <CreateForm slug={slug} onDone={() => setCreating(false)} /> : null}

      <div className="flex flex-col gap-4">
        {policies.map((p) => (
          <PolicyCard key={p.policy.key} slug={slug} detail={p} schedules={schedules} teams={teams} orgMembers={orgMembers} canManage={canManage} />
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
    if (!name.trim()) return setError("Name the policy.");
    start(async () => {
      const res = await createPolicyAction(slug, { name: name.trim(), key: key.trim() || slugify(name) });
      if (res.error) return setError(res.error);
      onDone();
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => { setName(e.target.value); if (!keyEdited) setKey(slugify(e.target.value)); }} placeholder="Sev1 response" /></Field>
        <Field label="Key"><Input value={key} onChange={(e) => { setKeyEdited(true); setKey(slugify(e.target.value)); }} placeholder="sev1-response" className="font-mono" /></Field>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create"}</Button>
      </div>
    </div>
  );
}

function PolicyCard({
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
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [repeat, setRepeat] = useState(detail.policy.repeatCount);
  const [levels, setLevels] = useState<LevelDraft[]>(
    detail.levels.map((l) => ({ targetType: l.targetType, targetRef: l.targetKey, delayMinutes: l.delayMinutes })),
  );

  function refOptions(type: string) {
    if (type === "schedule") return schedules.map((s) => ({ value: s.key, label: s.name }));
    if (type === "team") return teams.map((t) => ({ value: t.key, label: t.name }));
    return orgMembers.map((m) => ({ value: m.userId, label: m.name }));
  }
  function setLevel(i: number, patch: Partial<LevelDraft>) {
    setLevels((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch, ...(patch.targetType ? { targetRef: "" } : {}) } : l)));
  }
  function addLevel() {
    setLevels((ls) => [...ls, { targetType: "schedule", targetRef: "", delayMinutes: 5 }]);
  }
  function save() {
    setError(null);
    const clean = levels.filter((l) => l.targetRef);
    start(async () => {
      if (repeat !== detail.policy.repeatCount) {
        const up = await updatePolicyAction(slug, detail.policy.key, { repeatCount: repeat });
        if (up.error) return setError(up.error);
      }
      const res = await setPolicyLevelsAction(slug, detail.policy.key, clean);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      await deletePolicyAction(slug, detail.policy.key);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100"><Workflow className="size-4 text-zinc-500" /> {detail.policy.name}</p>
        <div className="flex items-center gap-3">
          {canManage ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              Repeat
              <Input value={String(repeat)} onChange={(e) => setRepeat(Number(e.target.value.replace(/[^0-9]/g, "")) || 0)} className="w-12" />
              × if unacked
            </span>
          ) : repeat > 0 ? (
            <span className="text-xs text-zinc-500">Repeats {repeat}× if unacked</span>
          ) : null}
          {canManage ? (
            <button type="button" onClick={remove} disabled={pending} className="text-zinc-500 hover:text-red-400" aria-label="Delete policy"><Trash2 className="size-4" /></button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {levels.length === 0 ? <p className="text-sm text-zinc-500">No levels yet.</p> : null}
        {levels.map((l, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/8 bg-white/2 p-2">
            <span className="grid size-6 shrink-0 place-items-center rounded bg-white/5 text-[11px] text-zinc-400">{i + 1}</span>
            {canManage ? (
              <>
                <Select ariaLabel="Target type" value={l.targetType} onValueChange={(v) => setLevel(i, { targetType: v })} options={TARGET_TYPES} />
                <Select ariaLabel="Target" value={l.targetRef} onValueChange={(v) => setLevel(i, { targetRef: v })} placeholder="Choose…" options={refOptions(l.targetType)} className="min-w-40 flex-1" />
                <div className="inline-flex items-center gap-1.5">
                  <Input value={String(l.delayMinutes)} onChange={(e) => setLevel(i, { delayMinutes: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} className="w-16" />
                  <span className="text-xs text-zinc-500">min</span>
                </div>
                <button type="button" onClick={() => setLevels((ls) => ls.filter((_, idx) => idx !== i))} className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400" aria-label="Remove level"><Trash2 className="size-4" /></button>
              </>
            ) : (
              <span className="text-sm text-zinc-300">{l.targetType} · {detail.levels[i]?.targetLabel || l.targetRef} · after {l.delayMinutes}m</span>
            )}
          </div>
        ))}
        {canManage ? (
          <>
            <div><Button variant="secondary" size="sm" onClick={addLevel}><Plus className="size-4" /> Add level</Button></div>
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <div><Button variant="secondary" size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save policy"}</Button></div>
          </>
        ) : null}
      </div>
    </div>
  );
}
