"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Play } from "lucide-react";
import { Button } from "@flagon/design";
import type { Check, CheckResult } from "@/lib/checks-api";
import { StatusPill, frequencyLabel } from "../checks-view";
import { activateCheckAction, deleteCheckAction, muteCheckAction, runCheckAction } from "../actions";

const RESULT_COLOR: Record<string, string> = {
  passing: "text-teal-300",
  degraded: "text-amber-300",
  failing: "text-red-300",
};
const BAR_COLOR: Record<string, string> = {
  passing: "bg-teal-400/70",
  degraded: "bg-amber-400/70",
  failing: "bg-red-400/70",
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString();
}
function relative(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${tone ?? "text-zinc-100"}`}>{value}</div>
    </div>
  );
}

/** A latency+status bar chart of recent runs (oldest → newest). */
function LatencyBars({ results }: { results: CheckResult[] }) {
  const runs = [...results].slice(0, 48).reverse();
  const max = Math.max(1, ...runs.map((r) => r.latencyMs ?? 0));
  return (
    <div className="flex h-16 items-end gap-0.5">
      {runs.map((r) => {
        const h = Math.max(6, Math.round(((r.latencyMs ?? 0) / max) * 100));
        return (
          <div
            key={r.id}
            title={`${r.status} · ${r.latencyMs ?? "—"} ms · ${fmtTime(r.runStartedAt)}`}
            className={`flex-1 rounded-sm ${BAR_COLOR[r.status] ?? "bg-white/10"}`}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 py-2 last:border-0">
      <span className="shrink-0 text-xs text-zinc-500">{label}</span>
      <span className="truncate text-right text-sm text-zinc-200">{value}</span>
    </div>
  );
}

const COMPARISON_LABEL: Record<string, string> = {
  equals: "equals",
  not_equals: "not equals",
  greater_than: ">",
  less_than: "<",
  contains: "contains",
  not_contains: "not contains",
  is_empty: "is empty",
  not_empty: "is not empty",
};

function ConfigDetails({ check }: { check: Check }) {
  const c = check.config as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, key: string) => {
    if (c[key] != null && c[key] !== "") rows.push({ label, value: String(c[key]) });
  };
  add("URL", "url");
  add("Method", "method");
  add("Host", "host");
  add("Port", "port");
  add("Hostname", "hostname");
  add("Record type", "recordType");
  add("Expected", "expected");
  add("Warn before expiry (days)", "expiryThresholdDays");
  add("Degraded after (ms)", "degradedThresholdMs");
  add("Failed after (ms)", "timeoutMs");

  const assertions = Array.isArray(c.assertions) ? (c.assertions as { source: string; property?: string; comparison: string; target?: string }[]) : [];

  return (
    <div>
      {rows.map((r) => (
        <ConfigRow key={r.label} label={r.label} value={r.value} />
      ))}
      {assertions.length ? (
        <div className="border-t border-white/5 pt-2">
          <div className="mb-1.5 text-xs text-zinc-500">Assertions</div>
          <div className="flex flex-col gap-1">
            {assertions.map((a, i) => (
              <div key={i} className="flex flex-wrap items-center gap-1.5 text-sm text-zinc-300">
                <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs">
                  {a.source}
                  {a.property ? `(${a.property})` : ""}
                </span>
                <span className="text-zinc-500">{COMPARISON_LABEL[a.comparison] ?? a.comparison}</span>
                {a.target != null && !["is_empty", "not_empty"].includes(a.comparison) ? (
                  <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs">{a.target}</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function assertionSummary(r: CheckResult): string | null {
  const a = Array.isArray(r.assertions) ? (r.assertions as { ok: boolean; source: string }[]) : [];
  if (!a.length) return null;
  const failed = a.filter((x) => !x.ok);
  return failed.length ? `${failed.length}/${a.length} assertions failed` : `${a.length} assertions passed`;
}

export function CheckDetail({
  slug,
  check,
  results,
  channels,
  canManage,
}: {
  slug: string;
  check: Check;
  results: CheckResult[];
  channels: { id: string; name: string }[];
  canManage: boolean;
}) {
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

  const [subscribed] = useState(() => channels.filter((ch) => check.alertChannelIds.includes(ch.id)));
  const withLatency = results.filter((r) => r.latencyMs != null);
  const up = results.filter((r) => r.status === "passing" || r.status === "degraded").length;
  const uptime = results.length ? ((up / results.length) * 100).toFixed(1) : "—";
  const avgLatency = withLatency.length
    ? Math.round(withLatency.reduce((s, r) => s + (r.latencyMs ?? 0), 0) / withLatency.length)
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusPill status={check.currentStatus} />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-100">{check.name}</h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                {check.type} · every {frequencyLabel(check.frequencySeconds)}
                {check.muted ? " · muted" : ""}
                {!check.activated ? " · paused" : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManage ? (
              <Button variant="secondary" onClick={() => router.push(`/${slug}/checks/${check.key}/edit`)} disabled={pending}>
                <Pencil className="size-4" /> Edit
              </Button>
            ) : null}
            <Button variant="primary" disabled={pending} onClick={() => act(() => runCheckAction(slug, check.key))}>
              <Play className="size-4" /> Run now
            </Button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm text-red-300">{err}</div>
      ) : null}

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Status" value={check.currentStatus} tone={RESULT_COLOR[check.currentStatus] ?? "text-zinc-300"} />
        <Stat label={`Uptime (last ${results.length || 0})`} value={uptime === "—" ? "—" : `${uptime}%`} />
        <Stat label="Avg latency" value={avgLatency != null ? `${avgLatency} ms` : "—"} />
        <Stat label="Last run" value={relative(check.lastRunAt)} />
      </div>

      {/* Latency chart */}
      {results.length ? (
        <div className="rounded-xl border border-white/10 bg-white/2 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-100">Response time</h2>
          <LatencyBars results={results} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-white/10 bg-white/2 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-100">Configuration</h2>
            <ConfigDetails check={check} />
            {canManage ? (
              <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-4">
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => activateCheckAction(slug, check.key, !check.activated))}>
                  {check.activated ? "Pause" : "Resume"}
                </Button>
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => act(() => muteCheckAction(slug, check.key, !check.muted))}>
                  {check.muted ? "Unmute" : "Mute"}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(`Delete "${check.name}"? This removes its run history.`)) return;
                    start(async () => {
                      const res = await deleteCheckAction(slug, check.key);
                      if (res.error) setErr(res.error);
                      else router.push(`/${slug}/checks`);
                    });
                  }}
                >
                  Delete
                </Button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/2 p-5">
            <h2 className="mb-3 text-sm font-semibold text-zinc-100">Alerting</h2>
            {subscribed.length ? (
              <div className="flex flex-col gap-1.5">
                {subscribed.map((ch) => (
                  <div key={ch.id} className="flex items-center gap-2 text-sm text-zinc-200">
                    <span className="size-1.5 rounded-full bg-teal-400" /> {ch.name}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                No alert channels selected.{" "}
                <Link href={`/${slug}/checks/${check.key}/edit`} className="text-teal-400 hover:text-teal-300">
                  Edit the check
                </Link>{" "}
                to add one.
              </p>
            )}
            {check.alertOnDegraded ? <p className="mt-2 text-xs text-zinc-500">Also alerts on degraded runs.</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/2 p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-100">Recent runs</h2>
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500">No runs yet. Use “Run now” to execute this check.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 font-medium">Latency</th>
                    <th className="py-1.5 pr-3 font-medium">HTTP</th>
                    <th className="py-1.5 pr-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const summary = assertionSummary(r);
                    return (
                      <tr key={r.id} className="border-t border-white/5 align-top">
                        <td className={`py-2 pr-3 font-medium ${RESULT_COLOR[r.status] ?? "text-zinc-300"}`}>
                          {r.status}
                          {r.errorMessage ? <div className="mt-0.5 text-xs font-normal text-zinc-500">{r.errorMessage}</div> : null}
                          {summary ? <div className="mt-0.5 text-xs font-normal text-zinc-500">{summary}</div> : null}
                        </td>
                        <td className="py-2 pr-3 text-zinc-300">{r.latencyMs != null ? `${r.latencyMs} ms` : "—"}</td>
                        <td className="py-2 pr-3 text-zinc-300">{r.httpStatus ?? "—"}</td>
                        <td className="py-2 pr-3 text-zinc-500">{fmtTime(r.runStartedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
