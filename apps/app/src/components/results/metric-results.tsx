import { TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";

/**
 * The shared Statsig-grade outcome readout, rendered identically by an experiment's
 * results and a flag's always-on impact. Per metric: a one-line verdict, then every
 * arm vs the control with the metric value, relative lift + confidence interval,
 * frequentist significance (z/t), and the headline Bayesian **chance to beat
 * control**, plus a sample-ratio-mismatch health check. Pure render — the stats
 * engine lives server-side.
 */

export type SharedVariantAnalysis = {
  variantKey: string;
  isControl: boolean;
  units: number;
  estimate: number;
  ciLow: number;
  ciHigh: number;
  absoluteLift: number | null;
  relativeLift: number | null;
  relativeLiftCiLow: number | null;
  relativeLiftCiHigh: number | null;
  pValue: number | null;
  probabilityToBeatControl: number | null;
  significant: boolean;
  sequentialPValue: number | null;
  sequentialCiLow: number | null;
  sequentialCiHigh: number | null;
  sequentiallySignificant: boolean;
};

export type SharedMetricAnalysis = {
  family: "conversion" | "continuous";
  direction: "increase" | "decrease";
  confidence: number;
  variants: SharedVariantAnalysis[];
  srm: { chiSquare: number; pValue: number; healthy: boolean } | null;
  cuped?: { applied: boolean; theta: number; varianceReduction: number };
};

export type SharedMetricResult = {
  metricKey: string;
  metricName: string;
  metricType: string;
  role: string;
  direction: "increase" | "decrease";
  analysis: SharedMetricAnalysis;
};

const ROLE_STYLES: Record<string, string> = {
  primary: "border-teal-500/30 bg-teal-500/10 text-teal-300",
  secondary: "border-white/12 bg-white/5 text-zinc-300",
  guardrail: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  watched: "border-white/12 bg-white/5 text-zinc-400",
};

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
/** A probability, capped so it never claims a misleading 100% / 0% certainty. */
function pctChance(x: number): string {
  if (x >= 0.9995) return ">99.9%";
  if (x <= 0.0005) return "<0.1%";
  return `${(x * 100).toFixed(1)}%`;
}
function signedPct(x: number): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
}
function fmtP(p: number | null): string {
  if (p === null) return "—";
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}
function valueLabel(family: SharedMetricAnalysis["family"], v: SharedVariantAnalysis): string {
  return family === "conversion" ? pct(v.estimate) : v.estimate.toFixed(2);
}

function ProbBar({ p, good }: { p: number; good: boolean }) {
  const w = Math.max(2, Math.min(100, p * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className={`h-full rounded-full ${good ? "bg-teal-500/80" : "bg-red-500/70"}`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function verdict(
  analysis: SharedMetricAnalysis,
  sequential: boolean,
): { tone: "win" | "loss" | "flat"; text: string } {
  const treatments = analysis.variants.filter((v) => !v.isControl);
  const enrolled = analysis.variants.reduce((s, v) => s + v.units, 0);
  if (treatments.length === 0 || enrolled === 0) {
    return { tone: "flat", text: "Gathering data, no exposures yet." };
  }
  const best = treatments.reduce((a, b) =>
    (b.probabilityToBeatControl ?? 0) > (a.probabilityToBeatControl ?? 0) ? b : a,
  );
  const chance = best.probabilityToBeatControl ?? 0;
  const strong = sequential ? best.sequentiallySignificant : best.significant;
  if (strong && chance >= 0.95) {
    return {
      tone: "win",
      text: `${best.variantKey} is winning: ${pctChance(chance)} chance to beat control, significant.${sequential ? " Safe to call it." : ""}`,
    };
  }
  if (sequential && best.significant && chance >= 0.95) {
    return { tone: "flat", text: `${best.variantKey} is trending to win (${pctChance(chance)} chance to beat control), not yet significant under safe-peeking, keep running.` };
  }
  if (chance <= 0.05) {
    return { tone: "loss", text: `${best.variantKey} is underperforming control (${pctChance(1 - chance)} chance control is better).` };
  }
  return { tone: "flat", text: `No clear winner yet: leading arm ${best.variantKey} at ${pctChance(chance)} chance to beat control.` };
}

const VERDICT_STYLES = {
  win: "border-teal-500/30 bg-teal-500/8 text-teal-200",
  loss: "border-red-500/30 bg-red-500/8 text-red-200",
  flat: "border-white/10 bg-white/4 text-zinc-300",
} as const;

function VariantRow({
  family,
  direction,
  v,
  sequential,
}: {
  family: SharedMetricAnalysis["family"];
  direction: SharedMetricAnalysis["direction"];
  v: SharedVariantAnalysis;
  sequential: boolean;
}) {
  if (v.isControl) {
    return (
      <tr className="border-b border-white/6 last:border-0">
        <td className="px-4 py-3">
          <span className="font-mono text-zinc-200">{v.variantKey}</span>
          <span className="ml-2 rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-400">
            control
          </span>
        </td>
        <td className="px-4 py-3 text-right text-zinc-300">{v.units.toLocaleString()}</td>
        <td className="px-4 py-3 text-right font-medium text-zinc-100">{valueLabel(family, v)}</td>
        <td className="px-4 py-3 text-right text-zinc-600">baseline</td>
        <td className="px-4 py-3 text-zinc-600">—</td>
        <td className="px-4 py-3 text-right text-zinc-600">—</td>
      </tr>
    );
  }
  const lift = v.relativeLift ?? 0;
  const good = direction === "increase" ? lift > 0 : lift < 0;
  const liftColor = lift === 0 ? "text-zinc-400" : good ? "text-teal-300" : "text-red-300";
  const chance = v.probabilityToBeatControl;
  const chanceGood = (chance ?? 0.5) >= 0.5;
  return (
    <tr className="border-b border-white/6 last:border-0">
      <td className="px-4 py-3">
        <span className="font-mono text-zinc-200">{v.variantKey}</span>
        {(sequential ? v.sequentiallySignificant : v.significant) ? (
          <span className="ml-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[11px] font-medium text-teal-300">
            significant
          </span>
        ) : sequential && v.significant ? (
          <span className="ml-2 rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
            trending
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 text-right text-zinc-300">{v.units.toLocaleString()}</td>
      <td className="px-4 py-3 text-right font-medium text-zinc-100">{valueLabel(family, v)}</td>
      <td className="px-4 py-3 text-right">
        <div className={`font-medium ${liftColor}`}>{signedPct(lift)}</div>
        {v.relativeLiftCiLow !== null && v.relativeLiftCiHigh !== null ? (
          <div className="text-[11px] text-zinc-500">
            [{signedPct(v.relativeLiftCiLow)}, {signedPct(v.relativeLiftCiHigh)}]
          </div>
        ) : null}
      </td>
      <td className="px-4 py-3">
        {chance !== null ? (
          <div className="flex min-w-30 flex-col gap-1">
            <span className={`text-sm font-semibold ${chanceGood ? "text-teal-300" : "text-red-300"}`}>
              {pctChance(chance)}
            </span>
            <ProbBar p={chance} good={chanceGood} />
          </div>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-mono text-xs text-zinc-400">{fmtP(v.pValue)}</td>
    </tr>
  );
}

function MetricCard({ metric, sequential }: { metric: SharedMetricResult; sequential: boolean }) {
  const { analysis } = metric;
  const v = verdict(analysis, sequential);
  const valueHeader = analysis.family === "conversion" ? "Rate" : "Mean";
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="flex items-center gap-3 border-b border-white/8 bg-white/2 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-zinc-100">{metric.metricName}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${ROLE_STYLES[metric.role] ?? ROLE_STYLES.secondary}`}
            >
              {metric.role}
            </span>
          </div>
          <span className="font-mono text-xs text-zinc-500">
            {metric.metricType} · {metric.direction === "increase" ? "higher is better" : "lower is better"}
          </span>
        </div>
        {analysis.cuped?.applied ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/25 bg-teal-500/8 px-2.5 py-1 text-[11px] font-medium text-teal-300">
            CUPED · {Math.round(analysis.cuped.varianceReduction * 100)}% variance removed
          </span>
        ) : null}
        {analysis.srm && !analysis.srm.healthy ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300">
            <TriangleAlert className="size-3.5" /> Sample ratio mismatch
          </span>
        ) : null}
      </div>

      {analysis.variants.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-zinc-500">No exposures recorded yet.</div>
      ) : (
        <>
          <div className={`flex items-center gap-2 px-4 py-2.5 text-sm ${VERDICT_STYLES[v.tone]}`}>
            {v.tone === "win" ? (
              <TrendingUp className="size-4 shrink-0" />
            ) : v.tone === "loss" ? (
              <TrendingDown className="size-4 shrink-0" />
            ) : null}
            <span>{v.text}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-[11px] tracking-wide text-zinc-500 uppercase">
                  <th className="px-4 py-2 font-medium">Variant</th>
                  <th className="px-4 py-2 text-right font-medium">Exposed</th>
                  <th className="px-4 py-2 text-right font-medium">{valueHeader}</th>
                  <th className="px-4 py-2 text-right font-medium">Lift (95% CI)</th>
                  <th className="px-4 py-2 font-medium">Chance to beat</th>
                  <th className="px-4 py-2 text-right font-medium">p-value</th>
                </tr>
              </thead>
              <tbody>
                {analysis.variants.map((row) => (
                  <VariantRow
                    key={row.variantKey}
                    family={analysis.family}
                    direction={analysis.direction}
                    v={row}
                    sequential={sequential}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/8 px-4 py-2.5 text-[11px] text-zinc-500">
            <span className="text-zinc-400">Chance to beat control</span> is Bayesian (posterior
            probability the arm is better).{" "}
            {sequential ? (
              <>
                <span className="text-teal-300/80">Significant</span> uses an always-valid sequential
                test, safe to peek and stop any time; <span className="text-zinc-400">trending</span>{" "}
                means the fixed {analysis.family === "conversion" ? "z" : "t"}-test fires but keep
                running for a safe call.
              </>
            ) : (
              <>
                <span className="text-teal-300/80">Significant</span> uses a fixed-horizon two-sided{" "}
                {analysis.family === "conversion" ? "z" : "t"}-test at {pct(analysis.confidence)},
                only valid at the planned sample size, don&apos;t peek early.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

/** The list of metric cards + an optional retention-window nudge. */
export function MetricResults({
  metrics,
  retentionDays,
  sequential = true,
  emptyHint,
}: {
  metrics: SharedMetricResult[];
  retentionDays?: number | null;
  /** Whether "significant" uses the sequential (safe-to-peek) test or the fixed one. */
  sequential?: boolean;
  emptyHint?: React.ReactNode;
}) {
  if (metrics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
        {emptyHint ?? "Attach a metric to measure impact."}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {retentionDays !== null && retentionDays !== undefined ? (
        <p className="text-xs text-zinc-500">
          Showing the last {retentionDays} days.{" "}
          <span className="text-zinc-600">Upgrade for more history.</span>
        </p>
      ) : null}
      {metrics.map((m) => (
        <MetricCard key={m.metricKey} metric={m} sequential={sequential} />
      ))}
    </div>
  );
}
