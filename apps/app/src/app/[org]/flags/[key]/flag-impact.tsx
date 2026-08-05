"use client";

import { useState, useTransition } from "react";
import { BarChart3, Check, Settings2 } from "lucide-react";
import {
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
} from "@flagon/design";
import type { FlagImpact } from "@/lib/flags-api";
import { MetricResults } from "@/components/results/metric-results";
import { getFlagImpactAction, setFlagMetricsAction } from "../actions";

/**
 * Always-on flag impact (Statsig-style): pick which reusable metrics to WATCH on a
 * flag and see each metric's per-variant impact — the flag's default variant as the
 * implicit control — without a formal experiment. Observational (fixed-horizon), so
 * it reads the same shared results view experiments use, minus the peeking discipline.
 */
export function FlagImpactPanel({
  slug,
  flagKey,
  environments,
  initialImpact,
  initialEnvironment,
  metricsLibrary,
  canManage,
}: {
  slug: string;
  flagKey: string;
  environments: { key: string; name: string }[];
  initialImpact: FlagImpact | null;
  initialEnvironment: string;
  metricsLibrary: { key: string; name: string }[];
  canManage: boolean;
}) {
  const [environment, setEnvironment] = useState(initialEnvironment);
  const [impact, setImpact] = useState<FlagImpact | null>(initialImpact);
  const [managing, setManaging] = useState(false);
  const [pending, start] = useTransition();

  const watchedKeys = impact?.metrics.map((m) => m.metricKey) ?? [];

  const switchEnv = (env: string) => {
    setEnvironment(env);
    start(async () => setImpact(await getFlagImpactAction(slug, flagKey, env)));
  };
  const refresh = () =>
    start(async () => setImpact(await getFlagImpactAction(slug, flagKey, environment)));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-300">
          <BarChart3 className="size-4 text-zinc-500" /> Impact
        </h2>
        <div className="flex items-center gap-2">
          {environments.length > 1 ? (
            <Select
              value={environment}
              onValueChange={switchEnv}
              options={environments.map((e) => ({ value: e.key, label: e.name }))}
              ariaLabel="Impact environment"
              className="w-auto"
            />
          ) : null}
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setManaging(true)}>
              <Settings2 className="size-3.5" /> Metrics
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        Per-variant impact of watched metrics, measured against the environment&apos;s default
        variant — no experiment required.
      </p>

      <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MetricResults
          metrics={impact?.metrics ?? []}
          retentionDays={impact?.retentionDays}
          sequential={false}
          emptyHint={
            <>
              No metrics watched yet.{" "}
              {canManage ? "Add one to see its always-on impact on this flag." : null}
            </>
          }
        />
      </div>

      {managing ? (
        <ManageMetricsModal
          slug={slug}
          flagKey={flagKey}
          library={metricsLibrary}
          watched={watchedKeys}
          onClose={() => setManaging(false)}
          onSaved={() => {
            setManaging(false);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function ManageMetricsModal({
  slug,
  flagKey,
  library,
  watched,
  onClose,
  onSaved,
}: {
  slug: string;
  flagKey: string;
  library: { key: string; name: string }[];
  watched: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(watched);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const save = () =>
    start(async () => {
      setError(null);
      const res = await setFlagMetricsAction(slug, flagKey, selected);
      if (res.error) return setError(res.error);
      onSaved();
    });

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="Watched metrics"
        description="Metrics whose impact shows on this flag."
        onClose={onClose}
      />
      <ModalBody>
        {library.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No metrics defined yet. Create a metric under Experiments → Metrics first.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {library.map((m) => {
              const on = selected.includes(m.key);
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(m.key)}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                    on
                      ? "border-teal-500/30 bg-teal-500/10 text-zinc-100"
                      : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {m.name} <span className="font-mono text-xs text-zinc-500">({m.key})</span>
                  </span>
                  {on ? <Check className="size-4 shrink-0 text-teal-400" /> : null}
                </button>
              );
            })}
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
