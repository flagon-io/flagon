"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FlaskConical, Search } from "lucide-react";
import { Input } from "@flagon/design";
import type { Experiment, ExperimentStatus } from "@/lib/experiments-api";
import { CreateExperimentButton } from "./create-experiment-dialog";

const STATUS_STYLES: Record<ExperimentStatus, string> = {
  draft: "border-white/12 bg-white/5 text-zinc-300",
  running: "border-teal-500/30 bg-teal-500/10 text-teal-300",
  stopped: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  archived: "border-white/10 bg-white/4 text-zinc-500",
};

export function StatusPill({ status }: { status: ExperimentStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

export function ExperimentsTable({
  slug,
  experiments,
  flags,
  metrics,
  environments,
}: {
  slug: string;
  experiments: Experiment[];
  flags: { key: string; name: string }[];
  metrics: { key: string; name: string }[];
  environments: { key: string; name: string }[];
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return experiments;
    return experiments.filter(
      (e) =>
        e.name.toLowerCase().includes(needle) ||
        e.key.toLowerCase().includes(needle) ||
        (e.flag ?? "").toLowerCase().includes(needle),
    );
  }, [experiments, q]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-zinc-100">Experiments</h1>
        <p className="text-sm text-zinc-400">
          Measure the impact of a rollout. An experiment turns a flag into an A/B test, with
          metrics tied directly to the variants serving it.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search experiments…"
            className="pl-9"
          />
        </div>
        <CreateExperimentButton
          slug={slug}
          flags={flags}
          metrics={metrics}
          environments={environments}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center">
          <FlaskConical className="size-8 text-zinc-600" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-zinc-300">
              {experiments.length === 0 ? "No experiments yet" : "No experiments match your search"}
            </p>
            <p className="text-sm text-zinc-500">
              {experiments.length === 0
                ? "Turn a flag rollout into a measured experiment to see which variant wins."
                : "Try a different search."}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {filtered.map((e, i) => (
            <Link
              key={e.id}
              href={`/${slug}/experiments/${e.key}`}
              className={`flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/3 ${
                i > 0 ? "border-t border-white/8" : ""
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-zinc-100">{e.name}</span>
                <span className="truncate font-mono text-xs text-zinc-500">{e.key}</span>
              </div>
              <div className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex">
                <span className="truncate text-xs text-zinc-400">
                  {e.flag ? (
                    <>
                      flag <span className="font-mono text-zinc-300">{e.flag}</span>
                    </>
                  ) : (
                    "no flag"
                  )}
                </span>
                <span className="truncate text-xs text-zinc-500">
                  {e.primaryMetric ? `primary: ${e.primaryMetric}` : "no primary metric"}
                </span>
              </div>
              <div className="hidden text-xs text-zinc-500 md:block">{e.environment}</div>
              <StatusPill status={e.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
