"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ChevronRight, Plus } from "lucide-react";
import { Button } from "@flagon/design";
import type { Check } from "@/lib/checks-api";
import { WipNotice } from "@/components/wip-notice";
import { intervalLabel, relativeTime, statusMeta, TYPE_LABELS } from "./checks-ui";

export function ChecksView({
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
  const newHref = `/${slug}/projects/${projectKey}/checks/new`;

  return (
    <div className="flex flex-col gap-6">
      <WipNotice feature="Checks" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Checks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Synthetic monitors on <span className="text-zinc-300">{projectName}</span>. A confirmed failure can alert a channel or open an incident.
          </p>
        </div>
        <span title={canManage ? undefined : "Only organization owners and admins can add checks"}>
          <Button variant="primary" disabled={!canManage} onClick={() => router.push(newHref)}>
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
          <p className="max-w-sm text-sm text-zinc-500">
            Add a check to probe an endpoint on a schedule. When it fails, Flagon can post to Slack or a webhook, or declare an incident and page on-call.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {checks.map((ch, i) => {
            const meta = statusMeta(ch.status);
            return (
              <Link
                key={ch.key}
                href={`/${slug}/projects/${projectKey}/checks/${ch.key}`}
                className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-white/3 ${i > 0 ? "border-t border-white/8" : ""}`}
              >
                <span className={`size-2.5 shrink-0 rounded-full ${meta.dot}`} title={meta.label} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{ch.name}</span>
                    {ch.hasOpenIncident ? <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-400">incident</span> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {TYPE_LABELS[ch.type] ?? ch.type} · every {intervalLabel(ch.intervalSeconds)} · checked {relativeTime(ch.lastCheckedAt)}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <div className={`text-sm font-medium ${meta.text}`}>{meta.label}</div>
                  {ch.lastLatencyMs != null ? <div className="text-xs text-zinc-500">{ch.lastLatencyMs}ms</div> : null}
                </div>
                <ChevronRight className="size-4 shrink-0 text-zinc-600" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
