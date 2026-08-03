"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Target, Trash2 } from "lucide-react";
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
import type { ExperimentMetric, MetricDirection, MetricType } from "@/lib/experiments-api";
import { createMetricAction, deleteMetricAction } from "../actions";

const TYPE_HELP: Record<MetricType, string> = {
  conversion: "Did the unit fire the event at least once (a rate).",
  count: "How many times the event fired per unit.",
  sum: "The summed numeric value across the unit's events.",
  mean: "The average numeric value per unit.",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function MetricsManager({
  slug,
  metrics,
  canManage,
}: {
  slug: string;
  metrics: ExperimentMetric[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return metrics;
    return metrics.filter(
      (m) => m.name.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle),
    );
  }, [metrics, q]);

  const remove = (key: string, name: string) => {
    if (!confirm(`Delete metric "${name}"? Experiments referencing it lose the attachment.`)) return;
    start(async () => {
      await deleteMetricAction(slug, key);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-zinc-100">Metrics</h1>
        <p className="text-sm text-zinc-400">
          Reusable goal definitions your experiments measure. A metric maps a track() event to an
          outcome; define it once and attach it to any experiment.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search metrics…"
          className="flex-1"
        />
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Create Metric
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center">
          <Target className="size-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-300">
            {metrics.length === 0 ? "No metrics yet" : "No metrics match your search"}
          </p>
          <p className="text-sm text-zinc-500">
            {metrics.length === 0
              ? "Define a goal metric to measure an experiment's impact."
              : "Try a different search."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {filtered.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-white/8" : ""}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-zinc-100">{m.name}</span>
                <span className="truncate font-mono text-xs text-zinc-500">{m.key}</span>
              </div>
              <div className="hidden min-w-0 flex-1 flex-col gap-0.5 sm:flex">
                <span className="truncate text-xs text-zinc-400">
                  event <span className="font-mono text-zinc-300">{m.eventName}</span>
                </span>
                <span className="truncate text-xs text-zinc-500 capitalize">
                  {m.type} · {m.direction === "increase" ? "higher is better" : "lower is better"}
                </span>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => remove(m.key, m.name)}
                  disabled={pending}
                  className="grid size-9 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-40"
                  aria-label={`Delete ${m.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateMetricModal slug={slug} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

function CreateMetricModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState("");
  const [eventName, setEventName] = useState("");
  const [type, setType] = useState<MetricType>("conversion");
  const [direction, setDirection] = useState<MetricDirection>("increase");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : slugify(name);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the metric a name.");
    if (!eventName.trim()) return setError("Name the track() event this metric measures.");
    start(async () => {
      const res = await createMetricAction(slug, {
        key: effectiveKey,
        name: name.trim(),
        description: description.trim() || null,
        type,
        eventName: eventName.trim(),
        direction,
      });
      if (res.error) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="xl">
      <ModalHeader
        title="Create Metric"
        description="Define a goal your experiments can measure."
        onClose={onClose}
      />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Checkout completed"
                autoFocus
              />
            </Field>
            <Field label="Key">
              <Input
                value={effectiveKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
                placeholder="checkout-completed"
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="Event name">
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="checkout_completed"
              className="font-mono"
            />
          </Field>

          <Field label="Type">
            <Select
              value={type}
              onValueChange={(v) => setType(v as MetricType)}
              options={[
                { value: "conversion", label: "Conversion" },
                { value: "count", label: "Count" },
                { value: "sum", label: "Sum" },
                { value: "mean", label: "Mean" },
              ]}
              ariaLabel="Metric type"
            />
          </Field>

          <p className="-mt-1 text-xs text-zinc-500">{TYPE_HELP[type]}</p>

          <Field label="Direction">
            <SegmentedControl
              value={direction}
              onValueChange={(v) => setDirection(v as MetricDirection)}
              options={[
                { value: "increase", label: "Higher is better" },
                { value: "decrease", label: "Lower is better" },
              ]}
              ariaLabel="Metric direction"
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this metric measures and why it matters…"
              rows={2}
            />
          </Field>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={pending || !name.trim()}>
          {pending ? "Creating…" : "Create"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
