"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gauge } from "lucide-react";
import { Button } from "@flagon/design";
import type { Check } from "@/lib/checks-api";
import { StatusPill, frequencyLabel } from "../../../checks/checks-view";

/**
 * A project's Checks tab — the checks related to this project, with a "New check" flow
 * that preselects the project (mirrors the project Incidents tab's declare flow). Rows
 * link into the shared check detail; management stays on the main Checks area.
 */
export function ProjectChecks({
  slug,
  projectKey,
  projectName,
  checks,
  canManage,
}: {
  slug: string;
  projectKey: string;
  projectName: string;
  checks: Check[];
  canManage: boolean;
}) {
  const router = useRouter();
  const newCheck = () => router.push(`/${slug}/checks/new?project=${encodeURIComponent(projectKey)}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Checks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Uptime and synthetic monitors related to {projectName}. New checks created here are linked to this project.
          </p>
        </div>
        <span title={canManage ? undefined : "Only organization owners and admins can create checks"}>
          <Button variant="primary" disabled={!canManage} onClick={newCheck}>
            <Gauge className="size-4" /> New check
          </Button>
        </span>
      </div>

      {checks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300">
            <Gauge className="size-5" />
          </span>
          <p className="text-base font-medium text-zinc-100">No checks for this project yet</p>
          <p className="max-w-sm text-sm text-zinc-500">
            Add a check here to watch {projectName}&apos;s endpoints and flows.
          </p>
          {canManage ? (
            <Button variant="primary" onClick={newCheck}>
              <Gauge className="size-4" /> New check
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {checks.map((check) => (
            <Link
              key={check.key}
              href={`/${slug}/checks/${check.key}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/2 px-4 py-3 hover:border-teal-400/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <StatusPill status={check.currentStatus} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-100">{check.name}</div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">
                    {check.type} · every {frequencyLabel(check.frequencySeconds)}
                    {check.muted ? " · muted" : ""}
                    {!check.activated ? " · paused" : ""}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
