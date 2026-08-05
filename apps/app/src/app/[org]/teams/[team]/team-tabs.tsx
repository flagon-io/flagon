"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { BellRing, Boxes, CalendarClock, Pencil } from "lucide-react";
import { cn } from "@flagon/design";
import { MemberAvatar } from "@/components/member-avatar";

/** A schedule bound to this team, pre-resolved server-side for display. */
export type TeamScheduleVM = {
  key: string;
  name: string;
  rotationIntervalHours: number;
  currentName: string | null;
  nextName: string | null;
  untilLabel: string | null;
};

type OwnedProject = { key: string; name: string };
type TabId = "members" | "oncall" | "projects";

/**
 * Tab-oriented team detail body. The header (name/description/about) stays
 * always-visible above this in the server page; here a FireHydrant-style tab
 * bar switches between Members, On-call, and Projects panels. All data is
 * fetched server-side and passed in: the interactive bits arrive as ready
 * React nodes (TeamMembersManager, the create-schedule action), the read-only
 * lists as plain data rendered here.
 */
export function TeamTabs({
  slug,
  memberCount,
  ownedCount,
  membersManager,
  schedules,
  oncallCreate,
  canManageTeam,
  ownedProjects,
}: {
  slug: string;
  memberCount: number;
  ownedCount: number;
  membersManager: ReactNode;
  schedules: TeamScheduleVM[];
  oncallCreate: ReactNode;
  canManageTeam: boolean;
  ownedProjects: OwnedProject[];
}) {
  const [active, setActive] = useState<TabId>("members");

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "members", label: "Members", count: memberCount },
    { id: "oncall", label: "On-call" },
    { id: "projects", label: "Projects", count: ownedCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/8">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-teal-400 text-zinc-100"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t.label}
              {typeof t.count === "number" ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                    isActive
                      ? "bg-teal-400/10 text-teal-300"
                      : "bg-white/6 text-zinc-400",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Members panel */}
      {active === "members" ? membersManager : null}

      {/* On-call panel */}
      {active === "oncall" ? (
        <div className="flex flex-col gap-4">
          {schedules.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-4 py-6">
              <div>
                <p className="text-sm text-zinc-100">
                  No on-call schedule for this team.
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Create a rotation and add people to it. It binds to this team.
                </p>
              </div>
              {oncallCreate}
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {schedules.map((s) => (
                <li
                  key={s.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/2 p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {s.currentName ? (
                      <MemberAvatar name={s.currentName} />
                    ) : (
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/5 text-zinc-500">
                        <CalendarClock className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="inline-flex items-center gap-2 text-sm font-medium text-zinc-100">
                        <CalendarClock className="size-3.5 shrink-0 text-zinc-500" />
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 text-xs font-normal text-zinc-600">
                          every {s.rotationIntervalHours}h
                        </span>
                      </p>
                      {s.currentName ? (
                        <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-zinc-400">
                          <BellRing className="size-3 shrink-0 text-teal-400" />
                          <span>
                            <span className="text-teal-300">{s.currentName}</span>{" "}
                            on-call
                            {s.nextName ? <>, then {s.nextName}</> : null}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          Nobody on-call yet.
                        </p>
                      )}
                      {s.currentName && s.untilLabel ? (
                        <p className="mt-0.5 text-[11px] text-zinc-600">
                          until {s.untilLabel}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={`/${slug}/incidents/on-call/${s.key}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/10"
                  >
                    <Pencil className="size-3.5" /> {canManageTeam ? "Edit" : "View"}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-zinc-500">
            Escalation policies are shared across teams. Manage them in{" "}
            <Link
              href={`/${slug}/incidents/escalation`}
              className="text-teal-400 hover:text-teal-300"
            >
              Escalation policies
            </Link>
            .
          </p>
        </div>
      ) : null}

      {/* Projects panel */}
      {active === "projects" ? (
        ownedProjects.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No projects yet. Assign this team as the owner from a project&apos;s
            settings.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
            {ownedProjects.map((p) => (
              <li key={p.key}>
                <Link
                  href={`/${slug}/projects/${p.key}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/3"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white/5 text-zinc-400">
                    <Boxes className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">{p.name}</p>
                    <p className="truncate font-mono text-xs text-zinc-500">{p.key}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
