import type { Experiment } from "@/lib/experiments-api";

/**
 * The Setup tab: a read-only summary of how the experiment is configured and,
 * crucially, how it is ANALYZED (confidence level, sequential vs fixed, multiple
 * comparison correction, bucketing). Those analysis parameters otherwise only
 * appear inside the Edit dialog, so surfacing them here makes the statistics the
 * experiment is running under legible at a glance. Editing stays in the header's
 * Edit button.
 */
const CORRECTION_LABEL: Record<string, string> = {
  none: "None",
  bonferroni: "Bonferroni",
  bh: "Benjamini-Hochberg (FDR)",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/6 py-2.5 text-sm last:border-b-0">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right text-zinc-200">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/8 bg-white/2 p-4">
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</h3>
      <dl className="flex flex-col">{children}</dl>
    </div>
  );
}

export function ExperimentSetup({ experiment }: { experiment: Experiment }) {
  const mono = (v: string) => <span className="font-mono">{v}</span>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Configuration">
        <Row label="Flag">
          {experiment.flag ? mono(experiment.flag) : <span className="text-zinc-500">not set</span>}
        </Row>
        <Row label="Environment">{experiment.environment ?? "—"}</Row>
        <Row label="Control (baseline arm)">
          {experiment.controlVariantKey ? (
            mono(experiment.controlVariantKey)
          ) : (
            <span className="text-amber-300">not set</span>
          )}
        </Row>
        <Row label="Allocation">{experiment.allocation}%</Row>
        <Row label="Bucket by">{experiment.bucketBy ? mono(experiment.bucketBy) : "targetingKey"}</Row>
      </Section>

      <Section title="Analysis">
        <Row label="Confidence level">{experiment.confidenceLevel}%</Row>
        <Row label="Significance test">
          {experiment.sequential ? "Sequential (always-valid, safe to peek)" : "Fixed horizon"}
        </Row>
        <Row label="Multiple-comparison correction">
          {CORRECTION_LABEL[experiment.correction] ?? experiment.correction}
        </Row>
        <Row label="CUPED variance reduction">
          {experiment.cuped ? "On" : "Off"}
        </Row>
      </Section>

      <Section title="Metrics">
        {experiment.metrics.length === 0 ? (
          <p className="py-1 text-sm text-zinc-500">No metrics attached.</p>
        ) : (
          experiment.metrics.map((m) => (
            <Row key={m.key} label={m.name}>
              <span className="text-xs text-zinc-400 capitalize">{m.role}</span>
            </Row>
          ))
        )}
      </Section>

      <Section title="Hypothesis">
        {experiment.hypothesis ? (
          <p className="py-1 text-sm/6 text-zinc-300">{experiment.hypothesis}</p>
        ) : (
          <p className="py-1 text-sm text-zinc-500">No hypothesis recorded.</p>
        )}
      </Section>
    </div>
  );
}
