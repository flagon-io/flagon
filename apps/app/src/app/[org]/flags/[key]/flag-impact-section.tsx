"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FlaskConical, X } from "lucide-react";
import { Button, Select } from "@flagon/design";
import { MetricResults, type SharedMetricResult } from "@/components/results/metric-results";
import { WEB_URL } from "@/lib/urls";
import { setFlagMetricsAction } from "../actions";

type Impact = {
  environment: string;
  controlVariantKey: string | null;
  totalUnits: number;
  retentionDays: number | null;
  metrics: SharedMetricResult[];
} | null;

/**
 * Always-on impact for a flag: watch metrics from the library and see per-variant
 * lift/chance-to-beat right here — no experiment needed. The control is the
 * environment's default variant; "Start experiment" formalizes it.
 */
export function FlagImpactSection({
  slug,
  flagKey,
  impact,
  allMetrics,
  canManage,
}: {
  slug: string;
  flagKey: string;
  impact: Impact;
  allMetrics: { key: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const watched = impact?.metrics.map((m) => m.metricKey) ?? [];

  const save = (next: string[]) =>
    start(async () => {
      await setFlagMetricsAction(slug, flagKey, next);
      router.refresh();
    });

  const watchedMeta = watched
    .map((k) => allMetrics.find((m) => m.key === k))
    .filter((m): m is { key: string; name: string } => Boolean(m));
  const unwatched = allMetrics.filter((m) => !watched.includes(m.key));

  return (
    <section>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-zinc-300">
            Impact <span className="ml-1 text-xs text-zinc-500">Production</span>
          </h2>
          <p className="text-xs text-zinc-500">
            How each variant moves your metrics, from exposures + goal events, no experiment
            needed.
          </p>
        </div>
        <Link href={`/${slug}/experiments`} className="shrink-0">
          <Button variant="secondary" size="sm">
            <FlaskConical className="size-3.5" /> Start experiment
          </Button>
        </Link>
      </div>

      {canManage ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {watchedMeta.map((m) => (
            <span
              key={m.key}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-zinc-300"
            >
              {m.name}
              <button
                type="button"
                onClick={() => save(watched.filter((k) => k !== m.key))}
                disabled={pending}
                className="text-zinc-500 transition-colors hover:text-red-400"
                aria-label={`Stop watching ${m.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {unwatched.length > 0 ? (
            <Select
              value=""
              onValueChange={(k) => save([...watched, k])}
              options={unwatched.map((m) => ({ value: m.key, label: m.name }))}
              placeholder="Watch a metric…"
              ariaLabel="Watch a metric"
              className="h-9 w-48"
            />
          ) : allMetrics.length === 0 ? (
            <Link
              href={`/${slug}/experiments/metrics`}
              className="text-xs text-teal-400 hover:underline"
            >
              Create a metric to measure impact →
            </Link>
          ) : null}
        </div>
      ) : null}

      <MetricResults
        metrics={impact?.metrics ?? []}
        retentionDays={impact?.retentionDays ?? null}
        emptyHint={
          <>
            Send exposures (with variant + targetingKey) and goal events, then watch a metric to
            see per-variant impact.{" "}
            <a
              href={`${WEB_URL}/docs/experiments`}
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 hover:underline"
            >
              Learn how →
            </a>
          </>
        }
      />
    </section>
  );
}
