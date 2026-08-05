"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BellRing, CalendarClock, Pencil, Plus, Users } from "lucide-react";
import { Button, Field, Input, Modal, ModalHeader, ModalBody, ModalFooter, Select } from "@flagon/design";
import type { OncallScheduleDetail } from "@/lib/oncall-api";
import { createScheduleAction } from "../actions";

type Opt = { key: string; name: string };
type OrgMember = { userId: string; name: string };
const NONE = "__none__";
const NO_MANAGE = "Only organization owners and admins can manage schedules.";

function slugify(v: string) {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

/** The on-call handoff moment (weekday + time), for "on-call until …". */
function handoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * On-call schedules index: a read-only grid of schedule cards. Each card
 * summarizes a rotation (name, binding, interval, size) and its current
 * on-call line, and links to the dedicated editor. Creating opens a small
 * modal, then routes straight to the new schedule's editor.
 */
export function SchedulesManager({
  slug,
  schedules,
  teams,
  orgMembers,
  canManage,
  initialCreate,
}: {
  slug: string;
  schedules: OncallScheduleDetail[];
  teams: Opt[];
  orgMembers: OrgMember[];
  canManage: boolean;
  initialCreate?: boolean;
}) {
  const [creating, setCreating] = useState((initialCreate ?? false) && canManage);
  const nameBy = new Map(orgMembers.map((m) => [m.userId, m.name]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">On-call schedules</h1>
          <p className="mt-1 text-sm text-zinc-500">Rotations that decide who responds. Bind one to a team or leave it standalone.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreating(true)}
          disabled={!canManage}
          title={canManage ? undefined : NO_MANAGE}
        >
          <Plus className="size-4" /> New schedule
        </Button>
      </div>

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-14 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300"><CalendarClock className="size-5" /></span>
          <p className="text-base font-medium text-zinc-100">No schedules</p>
          <p className="max-w-sm text-sm text-zinc-500">Create a rotation and add people to it. Whoever it lands on gets paged when a matching incident is declared.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {schedules.map((d) => (
            <ScheduleCard key={d.schedule.key} slug={slug} detail={d} nameBy={nameBy} canManage={canManage} />
          ))}
        </div>
      )}

      {creating ? <CreateModal slug={slug} teams={teams} onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function ScheduleCard({
  slug,
  detail,
  nameBy,
  canManage,
}: {
  slug: string;
  detail: OncallScheduleDetail;
  nameBy: Map<string, string>;
  canManage: boolean;
}) {
  const { schedule, current } = detail;
  const href = `/${slug}/incidents/on-call/${schedule.key}`;
  const currentName = current.current ? nameBy.get(current.current) ?? "On-call" : null;
  const nextName = current.next ? nameBy.get(current.next) : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
            <CalendarClock className="size-4 shrink-0 text-zinc-500" />
            <span className="truncate">{schedule.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {schedule.team ? `Team ${schedule.team.name}` : "Standalone"} · every {schedule.rotationIntervalHours}h
          </p>
        </div>
        <Link
          href={href}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
        >
          <Pencil className="size-3.5" /> {canManage ? "Edit" : "View"}
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
          <Users className="size-3.5" /> {schedule.memberCount} {schedule.memberCount === 1 ? "person" : "people"}
        </span>
      </div>

      <div className="rounded-lg border border-white/8 bg-white/2 px-3 py-2">
        {currentName ? (
          <>
            <p className="inline-flex items-center gap-1.5 text-sm text-zinc-200">
              <BellRing className="size-3.5 text-teal-400" />
              <span>
                <span className="text-teal-300">{currentName}</span> on-call{nextName ? <>, then {nextName}</> : null}
              </span>
            </p>
            {current.until ? <p className="mt-0.5 text-[11px] text-zinc-600">until {handoff(current.until)}</p> : null}
          </>
        ) : (
          <p className="text-sm text-zinc-500">Nobody on-call yet.</p>
        )}
      </div>
    </div>
  );
}

function CreateModal({ slug, teams, onClose }: { slug: string; teams: Opt[]; onClose: () => void }) {
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
    const finalName = name.trim();
    if (!finalName) return setError("Name the schedule.");
    const finalKey = key.trim() || slugify(finalName);
    start(async () => {
      const res = await createScheduleAction(slug, {
        name: finalName,
        key: finalKey,
        teamKey: team === NONE ? undefined : team,
        rotationIntervalHours: Number(interval) || 168,
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/incidents/on-call/${res.key ?? finalKey}`);
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader title="New schedule" description="Name it now. You will build the rotation on the next screen." onClose={onClose} />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); if (!keyEdited) setKey(slugify(e.target.value)); }}
              placeholder="Primary"
            />
          </Field>
          <Field label="Key" hint="Stable identifier. Auto-fills from the name.">
            <Input
              value={key}
              onChange={(e) => { setKeyEdited(true); setKey(slugify(e.target.value)); }}
              placeholder="primary"
              className="font-mono"
            />
          </Field>
          <Field label="Team" hint="Optional. Standalone if unset.">
            <Select
              ariaLabel="Team"
              value={team}
              onValueChange={setTeam}
              options={[{ value: NONE, label: "Standalone" }, ...teams.map((t) => ({ value: t.key, label: t.name }))]}
            />
          </Field>
          <Field label="Rotation interval (hours)" hint="How long each person holds the pager. 168 = one week.">
            <Input value={interval} onChange={(e) => setIntervalH(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" />
          </Field>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>{pending ? "Creating…" : "Create schedule"}</Button>
      </ModalFooter>
    </Modal>
  );
}
