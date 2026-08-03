import type { ExperimentResults } from "@/lib/experiments-api";
import { MetricResults } from "@/components/results/metric-results";
import { WEB_URL } from "@/lib/urls";

/**
 * The experiment results panel — a thin wrapper over the shared MetricResults view
 * (identical to a flag's always-on impact). Adds the enrollment header.
 */
const CORRECTION_LABEL: Record<string, string> = {
  none: "no correction",
  bonferroni: "Bonferroni",
  bh: "Benjamini-Hochberg",
};

/** Shown before any data arrives — so an empty experiment guides instead of looking broken. */
function WaitingForData() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
      <p className="text-sm font-medium text-zinc-200">Waiting for data</p>
      <p className="max-w-md text-sm text-zinc-500">
        Once you send <span className="text-zinc-300">exposures</span> (with the served{" "}
        <code className="text-zinc-400">variant</code> + <code className="text-zinc-400">targetingKey</code>) and{" "}
        <span className="text-zinc-300">goal events</span>, this fills in with each arm&apos;s conversion
        rate, <span className="text-teal-300/90">relative lift + confidence interval</span>, the{" "}
        <span className="text-teal-300/90">Bayesian chance to beat control</span>, p-value, and a
        significance verdict.
      </p>
      <a
        href={`${WEB_URL}/docs/experiments`}
        target="_blank"
        rel="noreferrer"
        className="text-sm text-teal-400 hover:underline"
      >
        How to send exposures + goal events →
      </a>
    </div>
  );
}

export function ResultsPanel({ results }: { results: ExperimentResults }) {
  const cfg = results.analysisConfig;
  const noData = results.totalUnits === 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-200">Results</h2>
          <span className="text-xs text-zinc-500">
            {results.totalUnits.toLocaleString()} units enrolled
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">
          <span className="text-zinc-300">Frequentist</span> (z/t-test, p-value + CI) +{" "}
          <span className="text-teal-300/90">Bayesian</span> (chance to beat control) ·{" "}
          {cfg.sequential ? (
            <span className="text-zinc-300">Sequential</span>
          ) : (
            <span className="text-zinc-300">Fixed-horizon</span>
          )}{" "}
          {cfg.sequential ? "(always-valid, safe to peek)" : ""} · {cfg.confidenceLevel}% CI ·{" "}
          {CORRECTION_LABEL[cfg.correction] ?? cfg.correction}
          {cfg.cuped ? (
            <>
              {" "}
              · <span className="text-teal-300/90">CUPED</span> (variance reduction)
            </>
          ) : null}
        </p>
      </div>

      {noData ? (
        <WaitingForData />
      ) : (
        <>
          {results.power ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/2 px-3 py-2 text-xs">
              <span className="text-zinc-400">
                Power: ~{results.power.requiredPerArm.toLocaleString()} units/arm to detect a ±
                {Math.round(results.power.mde * 100)}% change
              </span>
              <span className="text-zinc-500 tabular-nums">
                {results.power.currentPerArm.toLocaleString()} /{" "}
                {results.power.requiredPerArm.toLocaleString()} (
                {Math.min(100, Math.round((results.power.currentPerArm / results.power.requiredPerArm) * 100))}
                %)
              </span>
            </div>
          ) : null}

          <MetricResults
            metrics={results.metrics}
            retentionDays={results.retentionDays}
            sequential={cfg.sequential}
            emptyHint="Attach a metric to this experiment to measure its impact."
          />
        </>
      )}
    </div>
  );
}
