"use client";

import { useRouter } from "next/navigation";
import { Activity, CheckCircle2 } from "lucide-react";
import type { ObjectiveAttainment, ProjectUptime, UptimeReport } from "@/lib/uptime-api";

const WINDOWS = [7, 14, 30, 90];

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function duration(seconds: number): string {
  if (seconds < 1) return "0m";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
function tone(uptime: number): string {
  if (uptime >= 99.9) return "text-teal-300";
  if (uptime >= 99) return "text-amber-300";
  return "text-red-300";
}

export function UptimeView({ slug, report, windowDays }: { slug: string; report: UptimeReport | null; windowDays: number }) {
  const router = useRouter();
  if (!report) {
    return <p className="text-sm text-zinc-500">Uptime is unavailable right now.</p>;
  }
  const healthy = report.totals.uptimePct >= 99.99 && report.totals.incidentCount === 0;
  const worstFirst = [...report.perProject].sort((a, b) => a.uptimePct - b.uptimePct);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="inline-flex items-center gap-2.5 text-xl font-semibold tracking-tight text-zinc-100">
            <span className="grid size-8 place-items-center rounded-lg bg-white/5 text-zinc-300"><Activity className="size-4.5" /></span>
            Uptime
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Weighted uptime over the last {windowDays} days. Platform total rolls up each incident by its severity&apos;s platform impact.</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => router.push(`/${slug}/incidents/uptime?window=${w}`)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${w === windowDays ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {/* Platform headline */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-4">
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Platform uptime</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone(report.totals.uptimePct)}`}>{pct(report.totals.uptimePct)}</p>
          <p className="mt-0.5 text-xs text-zinc-600">across {report.totalServices} {report.totalServices === 1 ? "service" : "services"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-4">
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Weighted downtime</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{duration(report.totals.weightedDowntimeSeconds)}</p>
          <p className="mt-0.5 text-xs text-zinc-600">platform-level, this window</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-4">
          <p className="text-xs tracking-wide text-zinc-500 uppercase">Incidents</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{report.totals.incidentCount}</p>
          <p className="mt-0.5 text-xs text-zinc-600">affecting a service</p>
        </div>
      </div>

      {healthy ? (
        <div className="inline-flex items-center gap-2 rounded-xl border border-teal-400/20 bg-teal-400/10 px-4 py-2.5 text-sm text-teal-200">
          <CheckCircle2 className="size-4" /> All systems operational.
        </div>
      ) : null}

      {/* Objectives */}
      {report.objectives.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-200">Objectives</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.objectives.map((o) => (
              <ObjectiveCard key={o.key} o={o} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Per-service */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-zinc-200">Services</h2>
        {worstFirst.length === 0 ? (
          <p className="rounded-xl border border-white/8 bg-white/2 px-4 py-6 text-center text-sm text-zinc-500">No services yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            {worstFirst.map((p, idx) => (
              <ServiceRow key={p.projectKey} p={p} first={idx === 0} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ObjectiveCard({ o }: { o: ObjectiveAttainment }) {
  const burned = Math.max(0, Math.min(1, o.errorBudgetBurnedRatio));
  const barColor = o.attained ? "bg-teal-400/70" : "bg-red-400/70";
  return (
    <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400 uppercase">{o.label}</span>
          <span className="text-sm font-medium text-zinc-100">{o.name}</span>
        </div>
        <span className={`text-xs font-medium ${o.attained ? "text-teal-300" : "text-red-300"}`}>{o.attained ? "On track" : "At risk"}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-lg font-semibold tabular-nums ${tone(o.measuredUptimePct)}`}>{pct(o.measuredUptimePct)}</span>
        <span className="text-xs text-zinc-500">vs {o.targetPct}% target · {o.scopeType === "project" ? (o.scopeProjectKey ?? "project") : "platform"} · {o.windowDays}d</span>
      </div>
      {/* Error budget */}
      <div className="mt-2.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
          <div className={`h-full ${barColor}`} style={{ width: `${burned * 100}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          {o.errorBudgetPct <= 0
            ? "No error budget (100% target)."
            : `${Math.round(burned * 100)}% of error budget used · ${Math.max(0, o.errorBudgetRemainingPct).toFixed(2)}% remaining`}
        </p>
      </div>
    </div>
  );
}

function ServiceRow({ p, first }: { p: ProjectUptime; first: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${first ? "" : "border-t border-white/8"}`}>
      <span className={`inline-block size-1.5 shrink-0 rounded-full ${p.uptimePct >= 99.9 ? "bg-teal-400" : p.uptimePct >= 99 ? "bg-amber-400" : "bg-red-400"}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">{p.name}</span>
      {p.incidentCount > 0 ? (
        <span className="hidden text-xs text-zinc-600 sm:inline">{p.incidentCount} {p.incidentCount === 1 ? "incident" : "incidents"} · {duration(p.weightedDowntimeSeconds)}</span>
      ) : null}
      <span className={`shrink-0 text-sm font-medium tabular-nums ${tone(p.uptimePct)}`}>{pct(p.uptimePct)}</span>
    </div>
  );
}
