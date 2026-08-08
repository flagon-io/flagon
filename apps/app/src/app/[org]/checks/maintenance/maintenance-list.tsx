"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@flagon/design";
import type { MaintenanceWindow } from "@/lib/checks-api";

/**
 * Maintenance windows list (Checkly's Maintenance page): each row summarizes a window's
 * schedule + target, with a state pill (Active / Upcoming / Past). A "New maintenance
 * window" button (also in the empty state) starts the create flow.
 */
function scheduleLabel(w: MaintenanceWindow): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const repeat = w.repeat === "none" ? "" : `, repeats ${w.repeat}`;
  return `${fmt(w.startsAt)} → ${fmt(w.endsAt)}${repeat}`;
}

/** A coarse state for the pill; the exact recurring-occurrence math lives server-side. */
function windowState(w: MaintenanceWindow): "active" | "upcoming" | "past" {
  const now = Date.now();
  const start = new Date(w.startsAt).getTime();
  const end = new Date(w.endsAt).getTime();
  if (now >= start && now <= end) return "active";
  if (w.repeat !== "none") {
    const until = w.repeatEndsAt ? new Date(w.repeatEndsAt).getTime() : Infinity;
    if (now <= until) return now < start ? "upcoming" : "active";
  }
  return now < start ? "upcoming" : "past";
}

const PILL: Record<string, string> = {
  active: "border-teal-400/20 bg-teal-400/10 text-teal-300",
  upcoming: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  past: "border-white/10 bg-white/5 text-zinc-400",
};

function Row({ slug, window: w }: { slug: string; window: MaintenanceWindow }) {
  const state = windowState(w);
  return (
    <Link
      href={`/${slug}/checks/maintenance/${w.id}`}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/2 px-4 py-3 hover:border-teal-400/40"
    >
      <div className="flex min-w-0 items-center gap-3">
        <CalendarClock className="size-4 shrink-0 text-zinc-300" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">{w.name}</div>
          <div className="mt-0.5 truncate text-xs text-zinc-500">
            {scheduleLabel(w)} · {w.tags.length ? `tags: ${w.tags.join(", ")}` : "all checks"}
          </div>
        </div>
      </div>
      <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${PILL[state]}`}>
        {state}
      </span>
    </Link>
  );
}

export function MaintenanceList({
  slug,
  windows,
  canManage,
}: {
  slug: string;
  windows: MaintenanceWindow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const create = () => router.push(`/${slug}/checks/maintenance/new`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Maintenance windows</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Planned downtime. During a window, checks matching its tags are not run and never alert, so scheduled
          maintenance doesn&apos;t page anyone. Windows can repeat daily, weekly, or monthly.
        </p>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">Your windows</h2>
          {canManage && windows.length > 0 ? (
            <Button size="sm" variant="secondary" onClick={create}>
              <Plus className="size-3.5" /> New maintenance window
            </Button>
          ) : null}
        </div>
        {windows.length > 0 ? (
          <div className="flex flex-col gap-2">
            {windows.map((w) => (
              <Row key={w.id} slug={slug} window={w} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-14 text-center">
            <p className="text-base font-medium text-zinc-100">No maintenance windows yet</p>
            <p className="max-w-sm text-sm text-zinc-500">
              Create a window to pause checks during a planned deploy or maintenance so they don&apos;t alert.
            </p>
            {canManage ? (
              <Button variant="primary" onClick={create}>
                <Plus className="size-4" /> New maintenance window
              </Button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
