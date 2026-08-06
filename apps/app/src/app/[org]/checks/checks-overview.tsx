"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Plus } from "lucide-react";
import { Button } from "@flagon/design";
import type { OrgCheck } from "@/lib/checks-api";
import { WipNotice } from "@/components/wip-notice";

const DOT: Record<string, string> = {
  up: "bg-emerald-500",
  down: "bg-red-500",
  degraded: "bg-amber-500",
  paused: "bg-zinc-500",
  unknown: "bg-zinc-600",
};
const ORDER: Record<string, number> = { down: 0, degraded: 1, unknown: 2, up: 3, paused: 4 };

export function ChecksOverview({
  slug,
  checks,
  canManage,
  hasProjects,
}: {
  slug: string;
  checks: OrgCheck[];
  canManage: boolean;
  hasProjects: boolean;
}) {
  const router = useRouter();
  const sorted = [...checks].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || a.name.localeCompare(b.name));
  const down = checks.filter((c) => c.status === "down").length;
  const noProjects = !hasProjects;

  return (
    <div className="flex flex-col gap-6">
      <WipNotice feature="Checks" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Checks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {checks.length === 0
              ? "Synthetic monitors across every service."
              : down > 0
                ? `${down} check${down === 1 ? "" : "s"} down across ${checks.length} monitor${checks.length === 1 ? "" : "s"}.`
                : `All ${checks.length} monitor${checks.length === 1 ? "" : "s"} healthy.`}
          </p>
        </div>
        <span title={!canManage ? "Only organization owners and admins can add checks" : noProjects ? "Create a project first" : undefined}>
          <Button variant="primary" disabled={!canManage || noProjects} onClick={() => router.push(`/${slug}/checks/new`)}>
            <Plus className="size-4" /> Add check
          </Button>
        </span>
      </div>

      {checks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300">
            <Activity className="size-5" />
          </span>
          <p className="text-base font-medium text-zinc-100">No checks yet</p>
          <p className="max-w-sm text-sm text-zinc-500">Add a check and pick the service it monitors, or start from any project&apos;s Checks tab.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {sorted.map((ch, i) => (
            <Link
              key={`${ch.projectKey}/${ch.key}`}
              href={`/${slug}/projects/${ch.projectKey}/checks/${ch.key}`}
              className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/3 ${i > 0 ? "border-t border-white/8" : ""}`}
            >
              <span className={`size-2.5 shrink-0 rounded-full ${DOT[ch.status] ?? DOT.unknown}`} />
              <div className="min-w-0 flex-1">
                <span className="truncate text-sm font-medium text-zinc-100">{ch.name}</span>
                <p className="mt-0.5 truncate text-xs text-zinc-500">{ch.projectName}</p>
              </div>
              {ch.hasOpenIncident ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-400">incident</span> : null}
              <span className="text-xs text-zinc-400 capitalize">{ch.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
