"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  ListOrdered,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button, Field, Input, Select, useConfirm } from "@flagon/design";
import type { OncallScheduleDetail } from "@/lib/oncall-api";
import {
  addOverrideAction,
  deleteScheduleAction,
  removeOverrideAction,
  setScheduleMembersAction,
  updateScheduleAction,
} from "../../actions";

type Opt = { key: string; name: string };
type OrgMember = { userId: string; name: string };
const NONE = "__none__";
const NO_MANAGE = "Only organization owners and admins can manage schedules.";
const SHIFT_COUNT = 8;

function whenRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${fmt(startsAt)} → ${fmt(endsAt)}`;
}

/** "Aug 5, 9:00 AM" — one endpoint of a shift window. */
function fmtMoment(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** ISO string -> a `datetime-local` input value in the viewer's local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Shift = {
  slot: number;
  start: number;
  end: number;
  userId: string;
  isNow: boolean;
  overrides: { id: string; userId: string; startsAt: string; endsAt: string }[];
};

/**
 * The on-call schedule editor. Left column holds the ordered rotation and a
 * client-computed "upcoming shifts" timeline; the right sidebar holds schedule
 * details, overrides, and a delete card. Save batches the metadata and the
 * ordered members, then refreshes in place (it does not navigate away).
 * Overrides are their own immediate actions.
 */
export function ScheduleEditor({
  slug,
  detail,
  teams,
  orgMembers,
  canManage,
}: {
  slug: string;
  detail: OncallScheduleDetail;
  teams: Opt[];
  orgMembers: OrgMember[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { schedule, overrides } = detail;
  const key = schedule.key;

  const [name, setName] = useState(schedule.name);
  const [team, setTeam] = useState(schedule.team?.key ?? NONE);
  const [interval, setIntervalH] = useState(String(schedule.rotationIntervalHours));
  const initialAnchor = toLocalInput(schedule.anchorAt);
  const [anchor, setAnchor] = useState(initialAnchor);
  const [members, setMembers] = useState<string[]>(detail.members.map((m) => m.userId));
  const [addPick, setAddPick] = useState("");

  // Overrides add-row state.
  const [ovUser, setOvUser] = useState("");
  const [ovStart, setOvStart] = useState("");
  const [ovEnd, setOvEnd] = useState("");

  // The timeline "now" is set after mount to avoid a hydration mismatch.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const kick = setTimeout(tick, 0);
    const t = setInterval(tick, 30_000);
    return () => { clearTimeout(kick); clearInterval(t); };
  }, []);

  const nameBy = useMemo(() => new Map(orgMembers.map((m) => [m.userId, m.name])), [orgMembers]);
  const availableToAdd = orgMembers.filter((m) => !members.includes(m.userId));

  function touch() {
    setSaved(false);
    setError(null);
  }
  function moveMember(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= members.length) return;
    touch();
    setMembers((ms) => {
      const next = ms.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function removeMember(userId: string) {
    touch();
    setMembers((ms) => ms.filter((u) => u !== userId));
  }
  function addMember(userId: string) {
    if (!userId) return;
    touch();
    setMembers((ms) => (ms.includes(userId) ? ms : [...ms, userId]));
    setAddPick("");
  }

  const intervalNum = Number(interval) || 0;

  // Upcoming shifts, computed client-side from the ordered rotation, interval,
  // anchor, and overrides. A snapshot from the current "now".
  const shifts = useMemo<Shift[]>(() => {
    const n = members.length;
    const intervalMs = intervalNum * 3_600_000;
    if (n === 0 || intervalMs <= 0 || !now) return [];
    const anchorMs = anchor ? new Date(anchor).getTime() : new Date(schedule.anchorAt).getTime();
    const base = Number.isNaN(anchorMs) ? now : anchorMs;
    const slot0 = Math.floor((now - base) / intervalMs);
    const out: Shift[] = [];
    for (let k = 0; k < SHIFT_COUNT; k++) {
      const slot = slot0 + k;
      const startMs = base + slot * intervalMs;
      const endMs = startMs + intervalMs;
      const idx = ((slot % n) + n) % n;
      const covering = overrides.filter((o) => {
        const os = new Date(o.startsAt).getTime();
        const oe = new Date(o.endsAt).getTime();
        return os < endMs && oe > startMs;
      });
      out.push({
        slot,
        start: startMs,
        end: endMs,
        userId: members[idx],
        isNow: now >= startMs && now < endMs,
        overrides: covering,
      });
    }
    return out;
  }, [members, intervalNum, anchor, overrides, now, schedule.anchorAt]);

  function addOverrideRow() {
    setError(null);
    if (!ovUser) return setError("Pick who covers.");
    if (!ovStart || !ovEnd) return setError("Set a start and end.");
    if (new Date(ovEnd) <= new Date(ovStart)) return setError("End must be after start.");
    start(async () => {
      const res = await addOverrideAction(slug, key, {
        userId: ovUser,
        startsAt: new Date(ovStart).toISOString(),
        endsAt: new Date(ovEnd).toISOString(),
      });
      if (res.error) return setError(res.error);
      setOvUser("");
      setOvStart("");
      setOvEnd("");
      router.refresh();
    });
  }
  function removeOverrideRow(id: string) {
    setError(null);
    start(async () => {
      const res = await removeOverrideAction(slug, key, id);
      if (res.error) return setError(res.error);
      router.refresh();
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    start(async () => {
      const nextTeam = team === NONE ? null : team;
      const nextAnchorIso = anchor ? new Date(anchor).toISOString() : schedule.anchorAt;
      const patch: Record<string, unknown> = {};
      if (name.trim() && name.trim() !== schedule.name) patch.name = name.trim();
      if (nextTeam !== (schedule.team?.key ?? null)) patch.teamKey = nextTeam;
      if (intervalNum > 0 && intervalNum !== schedule.rotationIntervalHours) patch.rotationIntervalHours = intervalNum;
      if (anchor !== initialAnchor) patch.anchorAt = nextAnchorIso;
      if (Object.keys(patch).length > 0) {
        const up = await updateScheduleAction(slug, key, patch);
        if (up.error) return setError(up.error);
      }
      const mm = await setScheduleMembersAction(slug, key, members);
      if (mm.error) return setError(mm.error);
      setSaved(true);
      router.refresh();
    });
  }

  async function remove() {
    const ok = await confirm({
      title: "Delete schedule?",
      message: `"${schedule.name}" and its rotation and overrides will be removed.`,
      confirmLabel: "Delete schedule",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteScheduleAction(slug, key);
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/on-call`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {confirmDialog}

      {/* Header */}
      <div className="flex flex-col gap-3">
        <Link href={`/${slug}/incidents/on-call`} className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> On-call schedules
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">{name || schedule.name}</h1>
              {team === NONE ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-white/12 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                  <Users className="size-3" /> Standalone
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-teal-400/30 bg-teal-400/10 px-2.5 py-0.5 text-xs font-medium text-teal-300">
                  <Users className="size-3" /> Team {teams.find((t) => t.key === team)?.name ?? team}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {team === NONE ? "Not tied to a team" : "On-call for this team"} · every {schedule.rotationIntervalHours}h
            </p>
          </div>
          <div className="flex items-center gap-2">
            {saved ? <span className="text-sm text-teal-400">Saved.</span> : null}
            <Button variant="secondary" onClick={() => router.push(`/${slug}/incidents/on-call`)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={save}
              disabled={pending || !canManage}
              title={canManage ? undefined : NO_MANAGE}
            >
              {pending ? "Saving…" : "Save schedule"}
            </Button>
          </div>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-400">{error}</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: rotation + timeline */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Rotation */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
                <ListOrdered className="size-4 text-zinc-500" /> Rotation
              </h2>
              <span className="text-xs text-zinc-500">{members.length} {members.length === 1 ? "person" : "people"}</span>
            </div>

            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-8 text-center text-sm text-zinc-500">
                No one in the rotation yet. Add people below to decide who is paged.
              </div>
            ) : (
              <ol className="flex flex-col gap-2">
                {members.map((userId, i) => (
                  <li key={userId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/2 px-3 py-2.5">
                    {canManage ? (
                      <div className="flex flex-col">
                        <button type="button" onClick={() => moveMember(i, -1)} disabled={i === 0} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move up">
                          <ChevronUp className="size-3.5" />
                        </button>
                        <button type="button" onClick={() => moveMember(i, 1)} disabled={i === members.length - 1} className="text-zinc-600 hover:text-zinc-300 disabled:opacity-30" aria-label="Move down">
                          <ChevronDown className="size-3.5" />
                        </button>
                      </div>
                    ) : null}
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/6 text-xs font-medium text-zinc-300 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{nameBy.get(userId) ?? "Member"}</span>
                    {canManage ? (
                      <button type="button" onClick={() => removeMember(userId)} className="grid size-7 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400" aria-label="Remove from rotation">
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}

            {canManage && availableToAdd.length > 0 ? (
              <div className="flex items-center gap-2">
                <Select
                  ariaLabel="Add member to rotation"
                  value={addPick}
                  onValueChange={addMember}
                  placeholder="Add a person…"
                  fullWidth={false}
                  options={availableToAdd.map((m) => ({ value: m.userId, label: m.name }))}
                />
              </div>
            ) : null}
          </section>

          {/* Upcoming shifts timeline */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
                <CalendarClock className="size-4 text-zinc-500" /> Upcoming shifts
              </h2>
              <span className="text-xs text-zinc-500">next {SHIFT_COUNT}</span>
            </div>

            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-10 text-center text-sm text-zinc-500">
                Add people to the rotation to see the schedule.
              </div>
            ) : intervalNum <= 0 ? (
              <div className="rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-10 text-center text-sm text-zinc-500">
                Set a rotation interval to see the schedule.
              </div>
            ) : (
              <ol className="relative flex flex-col gap-0 rounded-xl border border-white/10 bg-white/2 p-2">
                {shifts.map((s) => (
                  <li key={s.slot} className="flex flex-col gap-2 border-b border-white/6 px-2 py-3 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium ${s.isNow ? "bg-teal-400/15 text-teal-300" : "bg-white/6 text-zinc-400"}`}>
                        <Users className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                          <span className="truncate">{nameBy.get(s.userId) ?? "Member"}</span>
                          {s.isNow ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-teal-400/30 bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium text-teal-300">
                              <BellRing className="size-2.5" /> On now
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{fmtMoment(s.start)} → {fmtMoment(s.end)}</p>
                      </div>
                    </div>

                    {/* Overrides that cover part of this shift win over the rotation. */}
                    {s.overrides.map((o) => (
                      <div key={o.id} className="ml-11 flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5">
                        <span className="inline-flex shrink-0 items-center rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">Override</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-amber-100">{nameBy.get(o.userId) ?? "Member"}</span>
                        <span className="shrink-0 text-[11px] text-amber-200/70 tabular-nums">{whenRange(o.startsAt, o.endsAt)}</span>
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Right: details + overrides + delete */}
        <aside className="flex flex-col gap-4">
          {/* Details */}
          <div className="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/2 p-4">
            <h2 className="text-sm font-medium text-zinc-200">Details</h2>

            <Field label="Responds for" hint="The team this rotation is on-call for. Leave standalone if it is not tied to a team.">
              <Select
                ariaLabel="Responds for"
                value={team}
                onValueChange={(v) => { touch(); setTeam(v); }}
                options={[{ value: NONE, label: "Standalone" }, ...teams.map((t) => ({ value: t.key, label: t.name }))]}
                disabled={!canManage}
              />
            </Field>

            <Field label="Name">
              <Input value={name} onChange={(e) => { touch(); setName(e.target.value); }} placeholder="Primary" disabled={!canManage} />
            </Field>

            <Field label="Key" hint="The schedule's stable identifier.">
              <p className="font-mono text-sm text-zinc-400">{key}</p>
            </Field>

            <Field label="Rotation interval (hours)" hint="How long each person holds the pager. 168 = one week.">
              <Input value={interval} onChange={(e) => { touch(); setIntervalH(e.target.value.replace(/[^0-9]/g, "")); }} inputMode="numeric" disabled={!canManage} />
            </Field>

            <Field label="Rotation start" hint="When the rotation's first shift begins.">
              <Input type="datetime-local" value={anchor} onChange={(e) => { touch(); setAnchor(e.target.value); }} disabled={!canManage} />
            </Field>

            <p className="rounded-lg border border-white/8 bg-white/2 px-3 py-2 text-xs/relaxed text-zinc-500">
              Who gets paged: the rotation advances by one person every interval, starting from the rotation start. An override temporarily takes over for its window and wins over the rotation.
            </p>
          </div>

          {/* Overrides */}
          <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
            <h2 className="inline-flex items-center gap-2 text-sm font-medium text-zinc-200">
              <CalendarClock className="size-4 text-zinc-500" /> Overrides
            </h2>

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
              <div className="flex flex-col gap-2 border-t border-white/8 pt-3">
                <Field label="Who covers">
                  <Select
                    ariaLabel="Override member"
                    value={ovUser}
                    onValueChange={setOvUser}
                    placeholder="Pick a person…"
                    options={orgMembers.map((m) => ({ value: m.userId, label: m.name }))}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="From">
                    <Input type="datetime-local" value={ovStart} onChange={(e) => setOvStart(e.target.value)} />
                  </Field>
                  <Field label="Until">
                    <Input type="datetime-local" value={ovEnd} onChange={(e) => setOvEnd(e.target.value)} />
                  </Field>
                </div>
                <div>
                  <Button variant="secondary" size="sm" onClick={addOverrideRow} disabled={pending || !ovUser || !ovStart || !ovEnd}>
                    <Plus className="size-4" /> Add override
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Delete */}
          {canManage ? (
            <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/2 p-4">
              <p className="text-sm font-medium text-zinc-200">Delete schedule</p>
              <p className="text-xs text-zinc-500">Removes this rotation and its overrides. This cannot be undone.</p>
              <div>
                <Button variant="danger" size="sm" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Delete schedule</Button>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
