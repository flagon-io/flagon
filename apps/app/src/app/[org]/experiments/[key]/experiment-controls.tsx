"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Trash2 } from "lucide-react";
import { Button, useConfirm } from "@flagon/design";
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
  const { confirm, confirmDialog } = useConfirm();
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

  const doStop = async () => {
    const ok = await confirm({
      title: "Stop experiment?",
      message: (
        <>
          Stopping <strong className="text-zinc-200">{experiment.name}</strong> ends enrollment and
          freezes its results. You can resume it later.
        </>
      ),
      confirmLabel: "Stop experiment",
      tone: "primary",
    });
    if (ok) run(() => experimentLifecycleAction(slug, key, "stop"));
  };

  const decide = async (decision: ExperimentDecision) => {
    const stops = experiment.status === "running";
    const ok = await confirm({
      title: `Record “${decision}”?`,
      message: stops ? (
        <>
          This records the decision <strong className="text-zinc-200">and stops</strong> the running
          experiment.
        </>
      ) : (
        <>This records the experiment&apos;s conclusion.</>
      ),
      confirmLabel: "Record decision",
      tone: "primary",
    });
    if (ok) run(() => decideExperimentAction(slug, key, decision));
  };

  const doDelete = async () => {
    const ok = await confirm({
      title: "Delete experiment?",
      message: (
        <>
          Deleting <strong className="text-zinc-200">{experiment.name}</strong> removes it and its
          enrollment + results. This cannot be undone.
        </>
      ),
      confirmLabel: "Delete experiment",
    });
    if (!ok) return;
    run(async () => {
      const res = await deleteExperimentAction(slug, key);
      if (!res.error) router.push(`/${slug}/experiments`);
      return res;
    });
  };

  // A non-manager still sees the RECORDED decision (read-only), just no controls.
  const decisions = ["ship", "rollback", "inconclusive"] as const;

  return (
    <div className="flex flex-col items-end gap-2">
      {canManage ? (
        <div className="flex items-center gap-2">
          {experiment.status === "running" ? (
            <Button variant="secondary" onClick={doStop} disabled={pending}>
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

          <Button
            variant="secondary"
            size="icon"
            aria-label="Delete experiment"
            onClick={doDelete}
            disabled={pending}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}

      {experiment.status !== "draft" ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Decision:</span>
          {canManage ? (
            decisions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => decide(d)}
                disabled={pending}
                aria-pressed={experiment.decision === d}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors disabled:opacity-40 ${
                  experiment.decision === d
                    ? "border-teal-500/40 bg-teal-500/15 text-teal-200"
                    : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10"
                }`}
              >
                {d}
              </button>
            ))
          ) : (
            <span className="rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300 capitalize">
              {experiment.decision ?? "none"}
            </span>
          )}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {confirmDialog}
    </div>
  );
}
