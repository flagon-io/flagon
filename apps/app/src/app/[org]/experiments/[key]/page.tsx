import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import {
  getExperiment,
  getExperimentDiagnostics,
  getExperimentResults,
  listMetrics,
} from "@/lib/experiments-api";
import { getFlag } from "@/lib/flags-api";
import { StatusPill } from "../experiments-table";
import { ExperimentControls } from "./experiment-controls";
import { ExperimentDiagnosticsPanel } from "./experiment-diagnostics";
import { EditExperimentButton } from "./experiment-settings-dialog";
import { ResultsPanel } from "./results-panel";
import { ExperimentSetup } from "./experiment-setup";
import { ExperimentTabs, resolveTab } from "./experiment-tabs";

/**
 * Experiment detail: header (config summary + lifecycle controls) over a tabbed
 * surface — Results (the statistical readout), Diagnostics (exposure/goal-event
 * streams), and Setup (how it is configured and analyzed). The active tab is
 * URL-driven (`?tab=`), so each is a shareable, server-rendered view. Data comes
 * from the API over HTTP; the console never touches experiment tables directly.
 */
export default async function ExperimentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; key: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org: slug, key } = await params;
  const tab = resolveTab((await searchParams).tab);
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [experiment, results, metricsLibrary, diagnostics] = await Promise.all([
    getExperiment(slug, key),
    getExperimentResults(slug, key),
    listMetrics(slug),
    getExperimentDiagnostics(slug, key),
  ]);
  if (!experiment) notFound();

  // The flag's variants power the editable control-arm picker.
  const flagDetail = experiment.flag ? await getFlag(slug, experiment.flag) : null;
  const variants = (flagDetail?.variants ?? []).map((v) => ({ key: v.key, label: v.label }));
  const canManage = canManageOrg(membership.role);

  const info: { label: string; value: React.ReactNode }[] = [
    { label: "Flag", value: experiment.flag ? <span className="font-mono">{experiment.flag}</span> : "—" },
    { label: "Environment", value: experiment.environment ?? "—" },
    {
      label: "Control",
      value: experiment.controlVariantKey ? (
        <span className="font-mono">{experiment.controlVariantKey}</span>
      ) : (
        <span className="text-amber-300">not set</span>
      ),
    },
    { label: "Allocation", value: `${experiment.allocation}%` },
    { label: "Primary metric", value: experiment.primaryMetric ?? "—" },
    {
      label: "Started",
      value: experiment.startedAt ? new Date(experiment.startedAt).toLocaleDateString() : "—",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/experiments`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="size-4" /> Experiments
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-100">{experiment.name}</h1>
            <StatusPill status={experiment.status} />
            {experiment.decision ? (
              <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-xs font-medium text-zinc-300 capitalize">
                {experiment.decision}
              </span>
            ) : null}
          </div>
          <span className="font-mono text-xs text-zinc-500">{experiment.key}</span>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <EditExperimentButton
              slug={slug}
              experiment={experiment}
              variants={variants}
              metricsLibrary={metricsLibrary.map((m) => ({ key: m.key, name: m.name }))}
              canManage={canManage}
            />
          </div>
          <ExperimentControls slug={slug} experiment={experiment} canManage={canManage} />
        </div>
      </div>

      <ExperimentTabs slug={slug} experimentKey={experiment.key} active={tab} />

      {tab === "results" ? (
        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="flex flex-col gap-6">
            {results ? (
              <ResultsPanel results={results} />
            ) : (
              <p className="text-sm text-zinc-500">Results are unavailable.</p>
            )}
          </div>

          <aside className="flex flex-col gap-6 lg:border-l lg:border-white/8 lg:pl-6">
            <div className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Configuration
              </h3>
              <dl className="flex flex-col gap-2">
                {info.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                    <dt className="text-zinc-500">{row.label}</dt>
                    <dd className="text-right text-zinc-200">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {experiment.metrics.length > 0 ? (
              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Metrics
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {experiment.metrics.map((m) => (
                    <li key={m.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-zinc-200">{m.name}</span>
                      <span className="text-xs text-zinc-500 capitalize">{m.role}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {experiment.hypothesis ? (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                  Hypothesis
                </h3>
                <p className="text-sm text-zinc-300">{experiment.hypothesis}</p>
              </div>
            ) : null}
          </aside>
        </div>
      ) : tab === "diagnostics" ? (
        diagnostics ? (
          <ExperimentDiagnosticsPanel diag={diagnostics} />
        ) : (
          <p className="text-sm text-zinc-500">Diagnostics are unavailable.</p>
        )
      ) : (
        <ExperimentSetup experiment={experiment} />
      )}
    </div>
  );
}
