"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CalendarClock, Plus, Trash2, Users, X } from "lucide-react";
import { Button, Field, Input, Select } from "@flagon/design";
import type { OncallScheduleDetail } from "@/lib/oncall-api";
import {
  addOverrideAction,
  createScheduleAction,
  deleteScheduleAction,
  removeOverrideAction,
  setScheduleMembersAction,
} from "../actions";

type Opt = { key: string; name: string };
type OrgMember = { userId: string; name: string };
const NONE = "__none__";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

function whenRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${fmt(startsAt)} → ${fmt(endsAt)}`;
}

export function SchedulesManager({
  slug,
  schedules,
  teams,
  orgMembers,
  canManage,
}: {
  slug: string;
  schedules: OncallScheduleDetail[];
  teams: Opt[];
  orgMembers: OrgMember[];
  canManage: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const nameBy = new Map(orgMembers.map((m) => [m.userId, m.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">On-call schedules</h1>
          <p className="mt-1 text-sm text-zinc-500">Rotations that decide who responds. Bind one to a team or leave it standalone.</p>
        </div>
        {canManage ? (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New schedule
          </Button>
        ) : null}
      </div>

      {schedules.length === 0 && !creating ? (
        <p className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-12 text-center text-sm text-zinc-500">
          No schedules yet. Create one and add people to the rotation.
        </p>
      ) : null}

      {creating ? <CreateForm slug={slug} teams={teams} onDone={() => setCreating(false)} /> : null}

      <div className="flex flex-col gap-4">
        {schedules.map((s) => (
          <ScheduleCard key={s.schedule.key} slug={slug} detail={s} orgMembers={orgMembers} nameBy={nameBy} canManage={canManage} />
        ))}
      </div>
    </div>
  );
}

function CreateForm({ slug, teams, onDone }: { slug: string; teams: Opt[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [team, setTeam] = useState(NONE);
  const [interval, setIntervalH] = useState("168");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    if (!name.trim()) return setError("Name the schedule.");
    start(async () => {
      const res = await createScheduleAction(slug, {
        name: name.trim(),
        key: key.trim() || slugify(name),
        teamKey: team === NONE ? undefined : team,
        rotationIntervalHours: Number(interval) || 168,
      });
      if (res.error) return setError(res.error);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={name} onChange={(e) => { setName(e.target.value); if (!keyEdited) setKey(slugify(e.target.value)); }} placeholder="Primary" /></Field>
        <Field label="Key"><Input value={key} onChange={(e) => { setKeyEdited(true); setKey(slugify(e.target.value)); }} placeholder="primary" className="font-mono" /></Field>
        <Field label="Team" hint="Optional; standalone if unset.">
          <Select ariaLabel="Team" value={team} onValueChange={setTeam} className="w-full" options={[{ value: NONE, label: "Standalone" }, ...teams.map((t) => ({ value: t.key, label: t.name }))]} />
        </Field>
        <Field label="Rotation (hours)"><Input value={interval} onChange={(e) => setIntervalH(e.target.value.replace(/[^0-9]/g, ""))} /></Field>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onDone}>Cancel</Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create"}</Button>
      </div>
    </div>
  );
}

function ScheduleCard({
  slug,
  detail,
  orgMembers,
  nameBy,
  canManage,
}: {
  slug: string;
  detail: OncallScheduleDetail;
  orgMembers: OrgMember[];
  nameBy: Map<string, string>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [members, setMembers] = useState<string[]>(detail.members.map((m) => m.userId));
  const [error, setError] = useState<string | null>(null);
  const [ovUser, setOvUser] = useState("");
  const [ovStart, setOvStart] = useState("");
  const [ovEnd, setOvEnd] = useState("");
  const { schedule, current, overrides } = detail;

  function toggle(userId: string) {
    setMembers((m) => (m.includes(userId) ? m.filter((u) => u !== userId) : [...m, userId]));
  }
  function addOverrideRow() {
    setError(null);
    if (!ovUser) return setError("Pick who covers.");
    if (!ovStart || !ovEnd) return setError("Set a start and end.");
    if (new Date(ovEnd) <= new Date(ovStart)) return setError("End must be after start.");
    start(async () => {
      const res = await addOverrideAction(slug, schedule.key, {
        userId: ovUser,
        startsAt: new Date(ovStart).toISOString(),
        endsAt: new Date(ovEnd).toISOString(),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setOvUser("");
      setOvStart("");
      setOvEnd("");
      router.refresh();
    });
  }
  function removeOverrideRow(id: string) {
    setError(null);
    start(async () => {
      const res = await removeOverrideAction(slug, schedule.key, id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }
  function save() {
    setError(null);
    start(async () => {
      const res = await setScheduleMembersAction(slug, schedule.key, members);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }
  function remove() {
    start(async () => {
      await deleteScheduleAction(slug, schedule.key);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-100">{schedule.name}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {schedule.team ? `Team ${schedule.team.name}` : "Standalone"} · every {schedule.rotationIntervalHours}h
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
            <BellRing className="size-3.5 text-teal-400" /> {current.current ? nameBy.get(current.current) ?? "On-call" : "Nobody on-call"}
          </span>
          {canManage ? (
            <button type="button" onClick={remove} disabled={pending} className="text-zinc-500 hover:text-red-400" aria-label="Delete schedule">
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium text-zinc-500">Rotation ({members.length})</p>
        {canManage ? (
          <div className="flex flex-wrap gap-1.5">
            {orgMembers.map((m) => {
              const on = members.includes(m.userId);
              const order = members.indexOf(m.userId);
              return (
                <button
                  key={m.userId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m.userId)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-teal-400/30 bg-teal-400/10 text-teal-200" : "border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-200"}`}
                >
                  {on ? <span className="tabular-nums">{order + 1}.</span> : null}
                  {m.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.members.map((m) => (
              <span key={m.userId} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                <Users className="size-3 text-zinc-500" /> {m.name || nameBy.get(m.userId)}
              </span>
            ))}
          </div>
        )}
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        {canManage ? (
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save rotation"}</Button>
          </div>
        ) : null}
      </div>

      {/* Overrides: temporary "cover for me" swaps that win over the rotation. */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <p className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <CalendarClock className="size-3.5" /> Overrides
        </p>
        {overrides.length === 0 ? (
          <p className="text-xs text-zinc-500">No overrides. The rotation decides who is on-call.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {overrides.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/8 bg-white/2 px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-200">{nameBy.get(o.userId) ?? "Member"}</p>
                  <p className="text-xs text-zinc-500 tabular-nums">{whenRange(o.startsAt, o.endsAt)}</p>
                </div>
                {canManage ? (
                  <button type="button" onClick={() => removeOverrideRow(o.id)} disabled={pending} className="shrink-0 text-zinc-500 hover:text-red-400 disabled:opacity-50" aria-label="Remove override">
                    <X className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="Who covers">
              <Select
                ariaLabel="Override member"
                value={ovUser}
                onValueChange={setOvUser}
                placeholder="Pick a member…"
                className="w-full"
                options={orgMembers.map((m) => ({ value: m.userId, label: m.name }))}
              />
            </Field>
            <Field label="From">
              <Input type="datetime-local" value={ovStart} onChange={(e) => setOvStart(e.target.value)} />
            </Field>
            <Field label="Until">
              <Input type="datetime-local" value={ovEnd} onChange={(e) => setOvEnd(e.target.value)} />
            </Field>
            <Button variant="secondary" onClick={addOverrideRow} disabled={pending || !ovUser || !ovStart || !ovEnd}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
