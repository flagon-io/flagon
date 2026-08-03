import { Activity } from "lucide-react";
import type { ExperimentDiagnostics } from "@/lib/experiments-api";

/**
 * The "is my data actually arriving and attributing?" trust surface — an exposure
 * stream + goal-event stream, plus per-arm counts. Pure render. Units are shown as
 * the salted hash we store (never a raw targeting key), so it's honest and holds no
 * PII.
 */

function when(iso: string): string {
  const then = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function StreamTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full min-w-100 text-sm">
        <thead className="sticky top-0 bg-zinc-950/80 backdrop-blur">
          <tr className="border-b border-white/8 text-left text-[11px] tracking-wide text-zinc-500 uppercase">
            {headers.map((h, i) => (
              <th key={h} className={`px-4 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b border-white/6 last:border-0">
              {cells.map((cell, i) => (
                <td key={i} className={`px-4 py-2 ${i > 0 ? "text-right" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExperimentDiagnosticsPanel({ diag }: { diag: ExperimentDiagnostics }) {
  const empty = diag.totals.exposures === 0 && diag.totals.events === 0;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Diagnostics</h2>
        <span className="text-xs text-zinc-500">
          {diag.totals.exposures.toLocaleString()} exposures · {diag.totals.events.toLocaleString()} goal
          events
        </span>
      </div>

      {empty ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          No exposures received yet. Send exposures with <code className="text-zinc-400">variant</code> +{" "}
          <code className="text-zinc-400">targetingKey</code> and goal events with <code className="text-zinc-400">track()</code>{" "}
          to verify data is flowing.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="flex items-center justify-between border-b border-white/8 bg-white/2 px-4 py-2.5">
              <span className="text-xs font-medium text-zinc-300">Exposure stream</span>
              <span className="text-[11px] text-zinc-500">
                {diag.arms.map((a) => `${a.variant} ${a.units.toLocaleString()}`).join(" · ")}
              </span>
            </div>
            {diag.recentExposures.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">No exposures yet.</div>
            ) : (
              <StreamTable
                headers={["Unit (hashed)", "Arm", "When"]}
                rows={diag.recentExposures.map((e) => [
                  <span key="u" className="font-mono text-xs text-zinc-400">{e.unit}…</span>,
                  <span key="v" className="font-mono text-zinc-200">{e.variant}</span>,
                  <span key="t" className="text-xs text-zinc-500">{when(e.at)}</span>,
                ])}
              />
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="border-b border-white/8 bg-white/2 px-4 py-2.5">
              <span className="text-xs font-medium text-zinc-300">Goal-event stream</span>
            </div>
            {diag.recentEvents.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-500">
                No goal events yet for this experiment&apos;s metrics.
              </div>
            ) : (
              <StreamTable
                headers={["Unit (hashed)", "Event", "Value", "When"]}
                rows={diag.recentEvents.map((e) => [
                  <span key="u" className="font-mono text-xs text-zinc-400">{e.unit}…</span>,
                  <span key="e" className="font-mono text-zinc-200">{e.event}</span>,
                  <span key="v" className="text-zinc-300 tabular-nums">{e.value}</span>,
                  <span key="t" className="text-xs text-zinc-500">{when(e.at)}</span>,
                ])}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
