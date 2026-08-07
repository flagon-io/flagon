"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { Boxes } from "lucide-react";
import { cn } from "@flagon/design";

type OwnedProject = { key: string; name: string };
type TabId = "members" | "projects";

/**
 * Tab-oriented team detail body. The header stays always-visible above this in the
 * server page; here a tab bar switches between the Members and Projects panels. The
 * interactive bits arrive as ready React nodes; the read-only lists render here.
 */
export function TeamTabs({
  slug,
  memberCount,
  ownedCount,
  membersManager,
  ownedProjects,
}: {
  slug: string;
  memberCount: number;
  ownedCount: number;
  membersManager: ReactNode;
  ownedProjects: OwnedProject[];
}) {
  const [active, setActive] = useState<TabId>("members");

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "members", label: "Members", count: memberCount },
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
                    isActive ? "bg-teal-400/10 text-teal-300" : "bg-white/6 text-zinc-400",
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

      {/* Projects panel */}
      {active === "projects" ? (
        ownedProjects.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No projects yet. Assign this team as the owner from a project&apos;s settings.
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
