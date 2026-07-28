import type { FlagUsage } from "@/lib/flags-api";

/**
 * Compact evaluation usage for the flag-detail sidebar: an overall total + rate,
 * a sparkline, last-seen, and a per-environment breakdown. The full-width panel
 * lives elsewhere; this is the at-a-glance version.
 */

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

const SPARK_DAYS = 14;

/** Combine every environment's daily series into one trailing-14-day array. */
function combinedSeries(usage: FlagUsage): number[] {
  const byDay = new Map<string, number>();
  for (const env of usage.environments) {
    for (const p of env.series) byDay.set(p.day, (byDay.get(p.day) ?? 0) + p.count);
  }
  const out: number[] = [];
  const now = Date.now();
  for (let i = SPARK_DAYS - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out.push(byDay.get(d) ?? 0);
  }
  return out;
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-8 items-end gap-0.5" aria-hidden>
      {values.map((v, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm ${v > 0 ? "bg-teal-500/50" : "bg-white/8"}`}
          style={{ height: `${v > 0 ? Math.max(14, (v / max) * 100) : 10}%` }}
        />
      ))}
    </div>
  );
}

export function EvaluationsAside({ usage }: { usage: FlagUsage }) {
  if (usage.total === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-zinc-400">Evaluations</p>
        <p className="mt-1.5 text-sm text-zinc-500">
          No evaluations yet. Point an OpenFeature OFREP provider at this flag to see
          traffic.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium text-zinc-400">Evaluations</p>
      <div className="mt-1.5 flex items-baseline justify-between">
        <span className="text-2xl font-semibold tabular-nums text-zinc-100">
          {compact(usage.total)}
        </span>
        <span className="text-xs text-zinc-500">last {relativeTime(usage.lastSeenAt)}</span>
      </div>
      <div className="mt-2">
        <Sparkline values={combinedSeries(usage)} />
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {usage.environments.map((env) => (
          <div key={env.key} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-zinc-400">{env.name}</span>
            <span className="tabular-nums text-zinc-500">{compact(env.total)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
