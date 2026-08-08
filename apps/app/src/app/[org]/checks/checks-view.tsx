"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gauge, Play } from "lucide-react";
import { Button } from "@flagon/design";
import type { Check, CheckStatus } from "@/lib/checks-api";
import { activateCheckAction, muteCheckAction, runCheckAction } from "./actions";

const STATUS_STYLE: Record<CheckStatus, { label: string; cls: string }> = {
  passing: { label: "Passing", cls: "border-teal-400/20 bg-teal-400/10 text-teal-300" },
  degraded: { label: "Degraded", cls: "border-amber-400/20 bg-amber-400/10 text-amber-300" },
  failing: { label: "Failing", cls: "border-red-400/20 bg-red-400/10 text-red-300" },
  unknown: { label: "Not run", cls: "border-white/10 bg-white/5 text-zinc-400" },
};

export function StatusPill({ status }: { status: CheckStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function frequencyLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${seconds / 60} min`;
  if (seconds < 86400) return `${seconds / 3600} h`;
  return `${seconds / 86400} d`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CheckRow({ slug, check, canManage }: { slug: string; check: Check; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const act = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setErr(null);
      const res = await fn();
      if (res?.error) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });

  return (
    <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/${slug}/checks/${check.key}`} className="flex min-w-0 flex-1 items-center gap-3">
          <StatusPill status={check.currentStatus} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-100">{check.name}</div>
            <div className="mt-0.5 truncate text-xs text-zinc-500">
              {check.type} · every {frequencyLabel(check.frequencySeconds)} · ran {relativeTime(check.lastRunAt)}
              {check.muted ? " · muted" : ""}
              {!check.activated ? " · paused" : ""}
            </div>
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => act(() => runCheckAction(slug, check.key))} disabled={pending}>
            <Play className="size-3.5" /> Run
          </Button>
          {canManage ? (
            <>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => activateCheckAction(slug, check.key, !check.activated))}>
                {check.activated ? "Pause" : "Resume"}
              </Button>
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => muteCheckAction(slug, check.key, !check.muted))}>
                {check.muted ? "Unmute" : "Mute"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {err ? <p className="mt-2 text-xs text-red-400">{err}</p> : null}
    </div>
  );
}

function Section({ title, slug, checks, canManage }: { title: string; slug: string; checks: Check[]; canManage: boolean }) {
  if (checks.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">{title}</h2>
      {checks.map((c) => (
        <CheckRow key={c.key} slug={slug} check={c} canManage={canManage} />
      ))}
    </div>
  );
}

export function ChecksView({ slug, checks, canManage }: { slug: string; checks: Check[]; canManage: boolean }) {
  const router = useRouter();
  // Derive from the prop (not a one-time useState snapshot) so the list updates after a
  // router.refresh() following create / run / pause / mute / delete.
  const uptime = useMemo(() => checks.filter((c) => c.family === "uptime"), [checks]);
  const synthetic = useMemo(() => checks.filter((c) => c.family === "synthetic"), [checks]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Checks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Uptime and synthetic monitoring. We run each check on a schedule and alert you when it fails.
          </p>
        </div>
        <span title={canManage ? undefined : "Only organization owners and admins can create checks"}>
          <Button variant="primary" disabled={!canManage} onClick={() => router.push(`/${slug}/checks/new`)}>
            <Gauge className="size-4" /> New check
          </Button>
        </span>
      </div>

      {checks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
          <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-zinc-300">
            <Gauge className="size-5" />
          </span>
          <p className="text-base font-medium text-zinc-100">No checks yet</p>
          <p className="max-w-sm text-sm text-zinc-500">
            Add a URL monitor to watch an endpoint, or a browser check to script a real user flow. We run
            it from our infrastructure and page you when it breaks.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Section title="Uptime monitors" slug={slug} checks={uptime} canManage={canManage} />
          <Section title="Synthetic checks" slug={slug} checks={synthetic} canManage={canManage} />
        </div>
      )}
    </div>
  );
}
