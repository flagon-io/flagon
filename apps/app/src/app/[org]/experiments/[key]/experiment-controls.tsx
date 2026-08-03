"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Trash2 } from "lucide-react";
import { Button } from "@flagon/design";
import type { Experiment, ExperimentDecision } from "@/lib/experiments-api";
import {
  decideExperimentAction,
  deleteExperimentAction,
  experimentLifecycleAction,
} from "../actions";

/**
 * Lifecycle controls for an experiment: start/stop, record a decision, and delete.
 * Draft/stopped -> Start; running -> Stop. Deciding records the conclusion and
 * (for a running experiment) stops it. Destructive actions are gated to managers.
 */
export function ExperimentControls({
  slug,
  experiment,
  canManage,
}: {
  slug: string;
  experiment: Experiment;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const key = experiment.key;

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) return setError(res.error);
      router.refresh();
    });

  const decide = (decision: ExperimentDecision) =>
    run(() => decideExperimentAction(slug, key, decision));

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {experiment.status === "running" ? (
          <Button
            variant="secondary"
            onClick={() => run(() => experimentLifecycleAction(slug, key, "stop"))}
            disabled={pending}
          >
            <Square className="size-4" /> Stop
          </Button>
        ) : experiment.status === "draft" || experiment.status === "stopped" ? (
          <Button
            variant="primary"
            onClick={() => run(() => experimentLifecycleAction(slug, key, "start"))}
            disabled={pending}
          >
            <Play className="size-4" /> {experiment.status === "stopped" ? "Resume" : "Start"}
          </Button>
        ) : null}

        {canManage ? (
          <Button
            variant="secondary"
            size="icon"
            aria-label="Delete experiment"
            onClick={() => {
              if (!confirm(`Delete experiment "${experiment.name}"? This cannot be undone.`)) return;
              run(async () => {
                const res = await deleteExperimentAction(slug, key);
                if (!res.error) router.push(`/${slug}/experiments`);
                return res;
              });
            }}
            disabled={pending}
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      {experiment.status !== "draft" ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Decision:</span>
          {(["ship", "rollback", "inconclusive"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => decide(d)}
              disabled={pending}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-40 ${
                experiment.decision === d
                  ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                  : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
