import { formatQuantity } from "@/lib/meters";
import {
  variantDistribution,
  type ExposureReason,
  type FlagAssessment,
  type FlagUsage,
  type VariantCount,
} from "@/lib/flag-metrics";
import type { ExposureSample } from "@/lib/flag-usage.server";

/**
 * Presentational pieces for per-flag usage, shared by the flags list and the
 * detail page so the two never render the same number two different ways. All
 * server components: the sparkline is plain SVG and the tooltips are native
 * title text, so none of this ships JavaScript.
 */

/**
 * A tiny bar sparkline. Bars, not a line, because the underlying data is a count
 * per hour - discrete buckets - and a line would imply a continuity between
 * hours that isn't there. Heights are relative to the series max, so a quiet
 * flag doesn't render as noise next to a busy one.
 *
 * ALWAYS the same box, even with no data: a faint baseline is drawn under every
 * sparkline so the cell reads as an empty chart rather than as a stray divider,
 * and every row keeps the same footprint whether it has traffic or not.
 */
export function Sparkline({
  buckets,
  className,
}: {
  buckets: number[];
  className?: string;
}) {
  const width = 80;
  const height = 22;
  const gap = 1;
  const count = buckets.length || 24;
  const max = Math.max(...buckets, 0);
  const barWidth = (width - gap * (count - 1)) / count;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {/* The baseline: present on every sparkline, so an empty one still reads
          as a chart and a single-bar one doesn't look like a divider. */}
      <line
        x1={0}
        y1={height - 0.5}
        x2={width}
        y2={height - 0.5}
        className="stroke-white/10"
        strokeWidth={1}
      />
      {max > 0
        ? buckets.map((value, index) => {
            const h = value > 0 ? Math.max((value / max) * height, 1.5) : 0;
            return (
              <rect
                key={index}
                x={index * (barWidth + gap)}
                y={height - h}
                width={barWidth}
                height={h}
                rx={0.5}
                className="fill-teal-500/70"
              />
            );
          })
        : null}
    </svg>
  );
}

/**
 * Active / Stale status. Stale is amber, not red: a cleanup CANDIDATE is a
 * suggestion, not an error, and the reasons ride in the tooltip so the verdict
 * is always explained rather than asserted.
 */
export function StatusPill({ assessment }: { assessment: FlagAssessment }) {
  if (!assessment.stale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        Active
      </span>
    );
  }
  return (
    <span
      title={assessment.reasons.join(" · ")}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden />
      Stale
    </span>
  );
}

/**
 * The list's usage cell: checks/hr over pass rate, both always on their own
 * line so every row's cell is exactly two lines tall and the column stays
 * aligned whether a flag has traffic or not.
 */
export function UsageCell({
  perHour,
  rate,
}: {
  perHour: number;
  rate: number | null;
}) {
  const checks =
    perHour <= 0
      ? "No checks yet"
      : `${perHour >= 1 ? formatQuantity(Math.round(perHour)) : perHour.toFixed(2)} checks/hr`;
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span
        className={`whitespace-nowrap text-xs tabular-nums ${
          perHour > 0 ? "text-zinc-300" : "text-zinc-600"
        }`}
      >
        {checks}
      </span>
      <span className="whitespace-nowrap text-xs tabular-nums text-zinc-600">
        {rate === null ? "no pass rate" : `${Math.round(rate * 100)}% pass`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Detail-page pieces
 * ------------------------------------------------------------------ */

const dateTimeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

/** A labelled stat, the unit muted under the number. */
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="border border-white/10 bg-white/2 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-zinc-100">
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-600">{sub}</div> : null}
    </div>
  );
}

/**
 * Checks over time: one bar per day across the window. Reuses the sparkline's
 * logic at a larger size, with a hoverable count per day. Server-rendered SVG.
 */
export function ChecksChart({ daily }: { daily: number[] }) {
  const max = Math.max(...daily, 0);
  if (max <= 0) {
    return (
      <div className="flex h-32 items-center justify-center border border-dashed border-white/10 text-sm text-zinc-600">
        No checks recorded in this window.
      </div>
    );
  }
  return (
    <div className="flex h-32 items-end gap-0.5">
      {daily.map((value, index) => (
        <div
          key={index}
          title={`${formatQuantity(value)} checks`}
          className="min-w-0 flex-1 rounded-t-sm bg-teal-500/60 transition hover:bg-teal-400"
          style={{
            height: `${value > 0 ? Math.max((value / max) * 100, 1.5) : 0}%`,
          }}
        />
      ))}
    </div>
  );
}

/** Variant distribution as labelled proportion bars. */
export function VariantBreakdown({ byVariant }: { byVariant: VariantCount[] }) {
  const dist = variantDistribution(byVariant);
  if (!dist.length)
    return <p className="text-sm text-zinc-600">No checks yet.</p>;
  return (
    <div className="space-y-2">
      {dist.map((v) => (
        <div key={v.variantKey}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-mono text-zinc-300">{v.variantKey}</span>
            <span className="tabular-nums text-zinc-500">
              {Math.round(v.share * 100)}% · {formatQuantity(v.count)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-teal-500/70"
              style={{ width: `${v.share * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

const REASON_LABEL: Record<ExposureReason, string> = {
  STATIC: "Default",
  TARGETING_MATCH: "Matched a rule",
  SPLIT: "Rollout split",
};

/** How served: default vs a targeting rule vs a rollout split. */
export function TargetingMix({
  byReason,
}: {
  byReason: FlagUsage["byReason"];
}) {
  const total =
    byReason.STATIC + byReason.TARGETING_MATCH + byReason.SPLIT || 0;
  if (total <= 0)
    return <p className="text-sm text-zinc-600">No checks yet.</p>;
  return (
    <div className="space-y-2">
      {(Object.keys(REASON_LABEL) as ExposureReason[]).map((reason) => {
        const count = byReason[reason];
        const share = count / total;
        return (
          <div key={reason}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-zinc-300">{REASON_LABEL[reason]}</span>
              <span className="tabular-nums text-zinc-500">
                {Math.round(share * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-zinc-400/60"
                style={{ width: `${share * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The staleness verdict spelled out, reasons listed. */
export function StaleAssessment({
  assessment,
}: {
  assessment: FlagAssessment;
}) {
  if (!assessment.stale) {
    return (
      <p className="text-sm text-zinc-400">
        This flag looks active. Nothing suggests it&apos;s safe to remove.
      </p>
    );
  }
  return (
    <div>
      <p className="text-sm text-amber-300">
        This flag looks like a cleanup candidate:
      </p>
      <ul className="mt-2 space-y-1 text-sm text-zinc-400">
        {assessment.reasons.map((reason) => (
          <li key={reason} className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-amber-400" aria-hidden />
            {reason}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-zinc-600">
        A suggestion, not a verdict. Confirm it&apos;s unused before removing.
      </p>
    </div>
  );
}

/** The sampled recent-exposures stream, or an honest note about what feeds it. */
export function ExposureStream({ samples }: { samples: ExposureSample[] }) {
  if (!samples.length) {
    return (
      <p className="text-sm text-zinc-600">
        No sampled checks yet. This stream is a diagnostic sample of individual
        lookups; aggregated client exposures feed the charts above, not this
        list.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-white/5 text-sm">
      {samples.map((s, index) => (
        <li key={index} className="flex items-center gap-3 py-2">
          <span className="font-mono text-zinc-300">{s.variantKey}</span>
          <span className="text-xs text-zinc-600">
            {REASON_LABEL[s.reason]}
          </span>
          <span className="ml-auto text-xs tabular-nums text-zinc-600">
            {s.targetingKeyHash ? `#${s.targetingKeyHash.slice(0, 8)}` : "anon"}
            {" · "}
            {dateTimeFmt.format(new Date(s.occurredAt))} UTC
          </span>
        </li>
      ))}
    </ul>
  );
}
