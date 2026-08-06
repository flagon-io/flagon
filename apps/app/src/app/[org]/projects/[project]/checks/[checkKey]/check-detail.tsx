"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pause, Play, Trash2, Zap } from "lucide-react";
import { Button } from "@flagon/design";
import type { CheckDetail } from "@/lib/checks-api";
import { WipNotice } from "@/components/wip-notice";
import { deleteCheckAction, pauseCheckAction, runCheckAction } from "../actions";
import { intervalLabel, relativeTime, statusMeta, TYPE_LABELS } from "../checks-ui";

export function CheckDetailView({
  slug,
  projectKey,
  check,
  canManage,
}: {
  slug: string;
  projectKey: string;
  check: CheckDetail;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [runResult, setRunResult] = useState<string | null>(null);
  const meta = statusMeta(check.status);

  function run() {
    setRunResult(null);
    startTransition(async () => {
      const res = await runCheckAction(slug, projectKey, check.key);
      if (res.error) setRunResult(res.error);
      else setRunResult(`${res.ok ? "Passed" : "Failed"}${res.responseMs != null ? ` in ${res.responseMs}ms` : ""}${res.statusCode != null ? ` (HTTP ${res.statusCode})` : ""}`);
      router.refresh();
    });
  }
  function togglePause() {
    startTransition(async () => {
      await pauseCheckAction(slug, projectKey, check.key, !check.paused);
      router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Delete check "${check.name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await deleteCheckAction(slug, projectKey, check.key);
      if (!res.error) router.push(`/${slug}/projects/${projectKey}/checks`);
    });
  }

  // Heartbeat bars: chronological (oldest → newest), so the most recent is on the right.
  const bars = [...check.recent].reverse();
  const target = check.type === "heartbeat" ? "inbound ping" : check.target.url ?? (check.target.host ? `${check.target.host}:${check.target.port ?? ""}` : "—");

  return (
    <div className="flex flex-col gap-6">
      <WipNotice feature="Checks" />
      <div>
        <Link href={`/${slug}/projects/${projectKey}/checks`} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> Checks
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className={`size-3 rounded-full ${meta.dot}`} />
            <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{check.name}</h1>
            <span className={`text-sm font-medium ${meta.text}`}>{meta.label}</span>
          </div>
          <p className="mt-1 truncate text-sm text-zinc-500">
            {TYPE_LABELS[check.type] ?? check.type} · every {intervalLabel(check.intervalSeconds)} · <span className="text-zinc-400">{target}</span>
          </p>
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={run} disabled={pending}><Zap className="size-4" /> Run now</Button>
            <Button variant="secondary" onClick={togglePause} disabled={pending}>
              {check.paused ? <><Play className="size-4" /> Resume</> : <><Pause className="size-4" /> Pause</>}
            </Button>
            <Button variant="secondary" onClick={remove} disabled={pending}><Trash2 className="size-4" /> Delete</Button>
          </div>
        ) : null}
      </div>

      {runResult ? <p className="rounded-md bg-white/5 px-3 py-2 text-sm text-zinc-300">{runResult}</p> : null}

      {check.pingUrl ? (
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-xs font-medium text-zinc-400">Heartbeat ping URL</p>
          <p className="mt-1 text-xs text-zinc-500">Have your job POST (or GET) this on schedule. The check fails if a ping is late. Keep it secret.</p>
          <code className="mt-2 block overflow-x-auto rounded-md bg-black/40 px-3 py-2 text-xs text-zinc-300">{check.pingUrl}</code>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Uptime (24h)" value={check.uptime24h != null ? `${check.uptime24h}%` : "—"} />
        <Stat label="Uptime (7d)" value={check.uptime7d != null ? `${check.uptime7d}%` : "—"} />
        <Stat label="Avg latency (24h)" value={check.avgLatencyMs != null ? `${check.avgLatencyMs}ms` : "—"} />
        <Stat label="Last checked" value={relativeTime(check.lastCheckedAt)} />
      </div>

      <div className="rounded-xl border border-white/10 p-4">
        <p className="text-xs font-medium text-zinc-400">Recent probes</p>
        {bars.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No probes yet. Run the check or wait for the next scheduled run.</p>
        ) : (
          <div className="mt-3 flex items-end gap-0.5">
            {bars.map((r, i) => (
              <span
                key={i}
                title={`${new Date(r.ranAt).toLocaleString()} · ${r.ok ? "ok" : "fail"}${r.error ? ` · ${r.error}` : ""}`}
                className={`h-8 flex-1 rounded-sm ${r.ok ? "bg-emerald-500/70" : "bg-red-500/80"}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-xs font-medium text-zinc-400">Configuration</p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <Row label="Failure threshold" value={`${check.failureThreshold} in a row`} />
            <Row label="Recovery threshold" value={`${check.recoveryThreshold} in a row`} />
            <Row label="Timeout" value={`${check.timeoutMs}ms`} />
            {check.assertions.keyword ? <Row label="Keyword" value={`${check.assertions.keywordAbsent ? "absent: " : ""}${check.assertions.keyword}`} /> : null}
            {check.assertions.maxLatencyMs ? <Row label="Max latency" value={`${check.assertions.maxLatencyMs}ms`} /> : null}
          </dl>
        </div>
        <div className="rounded-xl border border-white/10 p-4">
          <p className="text-xs font-medium text-zinc-400">On failure</p>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            {(() => {
              const a = check.action;
              const mode = a.mode ?? (a.incident ? "incident" : a.channelKeys?.length ? "notify" : "track");
              const modeLabel = mode === "incident" ? "Declare an incident" : mode === "notify" ? "Notify" : "Track only";
              return (
                <>
                  <Row label="Response" value={modeLabel} />
                  {mode !== "track" ? <Row label="Channels" value={a.channelKeys?.length ? a.channelKeys.join(", ") : "—"} /> : null}
                  {a.incident ? <Row label="Severity" value={a.incident.severity.toUpperCase()} /> : null}
                  {a.incident ? <Row label="Auto-resolve" value={a.incident.autoResolve === false ? "No" : "Yes"} /> : null}
                </>
              );
            })()}
          </dl>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-100">{value}</p>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate text-zinc-300">{value}</dd>
    </div>
  );
}
