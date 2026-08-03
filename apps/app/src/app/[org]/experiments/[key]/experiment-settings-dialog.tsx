"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, X } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  SegmentedControl,
  Select,
  Textarea,
} from "@flagon/design";
import type { Correction, Experiment, MetricRole } from "@/lib/experiments-api";
import { setExperimentMetricsAction, updateExperimentAction } from "../actions";

type Attached = { key: string; name: string; role: MetricRole };

export function EditExperimentButton({
  slug,
  experiment,
  variants,
  metricsLibrary,
  canManage,
}: {
  slug: string;
  experiment: Experiment;
  variants: { key: string; label: string | null }[];
  metricsLibrary: { key: string; name: string }[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!canManage) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" /> Edit
      </Button>
      {open ? (
        <EditExperimentDialog
          slug={slug}
          experiment={experiment}
          variants={variants}
          metricsLibrary={metricsLibrary}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function EditExperimentDialog({
  slug,
  experiment,
  variants,
  metricsLibrary,
  onClose,
}: {
  slug: string;
  experiment: Experiment;
  variants: { key: string; label: string | null }[];
  metricsLibrary: { key: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(experiment.name);
  const [hypothesis, setHypothesis] = useState(experiment.hypothesis ?? "");
  const [control, setControl] = useState(experiment.controlVariantKey ?? "");
  const [allocation, setAllocation] = useState(String(experiment.allocation));
  const [bucketBy, setBucketBy] = useState(experiment.bucketBy ?? "");
  const [confidenceLevel, setConfidenceLevel] = useState(experiment.confidenceLevel);
  const [sequential, setSequential] = useState(experiment.sequential);
  const [correction, setCorrection] = useState<Correction>(experiment.correction);
  const [cuped, setCuped] = useState(experiment.cuped);
  const [metrics, setMetrics] = useState<Attached[]>(
    experiment.metrics.map((m) => ({ key: m.key, name: m.name, role: m.role })),
  );
  const [error, setError] = useState<string | null>(null);

  const setRole = (key: string, role: MetricRole) =>
    setMetrics((prev) => {
      // Only one primary — demote any other primary if this becomes primary.
      const next = prev.map((m) => (m.key === key ? { ...m, role } : m));
      if (role === "primary") {
        return next.map((m) => (m.key !== key && m.role === "primary" ? { ...m, role: "secondary" } : m));
      }
      return next;
    });
  const removeMetric = (key: string) => setMetrics((prev) => prev.filter((m) => m.key !== key));
  const addMetric = (key: string) => {
    const def = metricsLibrary.find((m) => m.key === key);
    if (!def || metrics.some((m) => m.key === key)) return;
    const role: MetricRole = metrics.some((m) => m.role === "primary") ? "secondary" : "primary";
    setMetrics((prev) => [...prev, { key: def.key, name: def.name, role }]);
  };

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the experiment a name.");
    const alloc = Number(allocation);
    if (!Number.isInteger(alloc) || alloc < 1 || alloc > 100) return setError("Allocation must be 1–100.");
    start(async () => {
      const upd = await updateExperimentAction(slug, experiment.key, {
        name: name.trim(),
        hypothesis: hypothesis.trim() || null,
        controlVariantKey: control || null,
        allocation: alloc,
        bucketBy: bucketBy.trim() || null,
        confidenceLevel,
        sequential,
        correction,
        cuped,
      });
      if (upd.error) return setError(upd.error);
      const m = await setExperimentMetricsAction(
        slug,
        experiment.key,
        metrics.map(({ key, role }) => ({ key, role })),
      );
      if (m.error) return setError(m.error);
      onClose();
      router.refresh();
    });
  }

  const unattached = metricsLibrary.filter((m) => !metrics.some((a) => a.key === m.key));
  const variantOptions = variants.map((v) => ({
    value: v.key,
    label: v.label ? `${v.label} (${v.key})` : v.key,
  }));
  const roleOptions = [
    { value: "primary", label: "Primary" },
    { value: "secondary", label: "Secondary" },
    { value: "guardrail", label: "Guardrail" },
  ];

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader title="Edit experiment" description="Configuration and metrics." onClose={onClose} />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Control (baseline arm)">
              <Select
                value={control}
                onValueChange={setControl}
                options={variantOptions}
                placeholder="Select control"
                ariaLabel="Control variant"
              />
            </Field>
            <Field label="Allocation (%)">
              <Input
                type="number"
                min={1}
                max={100}
                value={allocation}
                onChange={(e) => setAllocation(e.target.value)}
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="Bucket by (context attribute, optional)">
            <Input
              value={bucketBy}
              onChange={(e) => setBucketBy(e.target.value)}
              placeholder="targetingKey (default)"
              className="font-mono"
            />
          </Field>

          <Field label="Hypothesis">
            <Textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="We believe…"
              rows={2}
            />
          </Field>

          <div className="rounded-lg border border-white/8 bg-white/2 p-3">
            <p className="mb-3 text-xs font-medium tracking-wide text-zinc-400 uppercase">
              Analysis
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Confidence level">
                <Select
                  value={String(confidenceLevel)}
                  onValueChange={(v) => setConfidenceLevel(Number(v))}
                  options={[
                    { value: "90", label: "90%" },
                    { value: "95", label: "95%" },
                    { value: "99", label: "99%" },
                  ]}
                  ariaLabel="Confidence level"
                />
              </Field>
              <Field label="Correction">
                <Select
                  value={correction}
                  onValueChange={(v) => setCorrection(v as Correction)}
                  options={[
                    { value: "none", label: "None" },
                    { value: "bonferroni", label: "Bonferroni" },
                    { value: "bh", label: "Benjamini-Hochberg" },
                  ]}
                  ariaLabel="Multiple-hypothesis correction"
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Significance test">
                <SegmentedControl
                  value={sequential ? "sequential" : "fixed"}
                  onValueChange={(v) => setSequential(v === "sequential")}
                  options={[
                    { value: "sequential", label: "Sequential (safe to peek)" },
                    { value: "fixed", label: "Fixed horizon" },
                  ]}
                  ariaLabel="Significance test"
                />
              </Field>
              <p className="mt-1.5 text-xs text-zinc-500">
                Sequential is always-valid: check results any time without inflating false positives.
                Fixed is only valid at the planned sample size.
              </p>
            </div>
            <div className="mt-3">
              <Field label="CUPED variance reduction">
                <SegmentedControl
                  value={cuped ? "on" : "off"}
                  onValueChange={(v) => setCuped(v === "on")}
                  options={[
                    { value: "on", label: "On" },
                    { value: "off", label: "Off" },
                  ]}
                  ariaLabel="CUPED variance reduction"
                />
              </Field>
              <p className="mt-1.5 text-xs text-zinc-500">
                Adjusts each metric by its pre-exposure value to remove baseline noise, so results
                reach significance with less data. No effect until units have pre-experiment history.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-zinc-400">Metrics</span>
            {metrics.length === 0 ? (
              <p className="text-xs text-zinc-500">No metrics attached. Add one to measure impact.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {metrics.map((m) => (
                  <div key={m.key} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
                    <span className="truncate text-sm text-zinc-200">{m.name}</span>
                    <Select
                      value={m.role}
                      onValueChange={(r) => setRole(m.key, r as MetricRole)}
                      options={roleOptions}
                      ariaLabel={`Role for ${m.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeMetric(m.key)}
                      className="grid size-9 place-items-center rounded-md text-zinc-500 hover:bg-white/5 hover:text-red-400"
                      aria-label={`Remove ${m.name}`}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {unattached.length > 0 ? (
              <Select
                value=""
                onValueChange={addMetric}
                options={unattached.map((m) => ({ value: m.key, label: m.name }))}
                placeholder="Add a metric…"
                ariaLabel="Add a metric"
                className="mt-1 w-56"
              />
            ) : metricsLibrary.length === 0 ? (
              <a href={`/${slug}/experiments/metrics`} className="text-xs text-teal-400 hover:underline">
                <Plus className="mr-1 inline size-3" />
                Create a metric first
              </a>
            ) : null}
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
