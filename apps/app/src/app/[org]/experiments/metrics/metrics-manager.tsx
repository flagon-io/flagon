"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
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
  useConfirm,
} from "@flagon/design";
import type {
  ExperimentMetric,
  MetricBody,
  MetricDirection,
  MetricType,
} from "@/lib/experiments-api";
import { createMetricAction, deleteMetricAction, updateMetricAction } from "../actions";

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
  const { confirm, confirmDialog } = useConfirm();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExperimentMetric | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return metrics;
    return metrics.filter(
      (m) => m.name.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle),
    );
  }, [metrics, q]);

  const remove = async (key: string, name: string) => {
    const ok = await confirm({
      title: "Delete metric?",
      message: (
        <>
          Deleting <strong className="text-zinc-200">{name}</strong> detaches it from every
          experiment that references it. Running experiments keep their frozen snapshot; drafts lose
          the attachment.
        </>
      ),
      confirmLabel: "Delete metric",
    });
    if (!ok) return;
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
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    disabled={pending}
                    className="grid size-9 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
                    aria-label={`Edit ${m.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.key, m.name)}
                    disabled={pending}
                    className="grid size-9 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-40"
                    aria-label={`Delete ${m.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {creating ? <MetricModal slug={slug} onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <MetricModal slug={slug} metric={editing} onClose={() => setEditing(null)} />
      ) : null}
      {confirmDialog}
    </div>
  );
}

function MetricModal({
  slug,
  metric,
  onClose,
}: {
  slug: string;
  metric?: ExperimentMetric;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(metric?.name ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState(metric?.key ?? "");
  const [eventName, setEventName] = useState(metric?.eventName ?? "");
  const [type, setType] = useState<MetricType>(metric?.type ?? "conversion");
  const [valueField, setValueField] = useState(metric?.valueField ?? "");
  const [direction, setDirection] = useState<MetricDirection>(metric?.direction ?? "increase");
  const [description, setDescription] = useState(metric?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  // The key is immutable once a metric exists; only derive it while creating.
  const effectiveKey = metric ? metric.key : keyTouched ? key : slugify(name);
  // A numeric value only means something for sum/mean; conversion/count ignore it.
  const usesValue = type === "sum" || type === "mean";

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the metric a name.");
    if (!eventName.trim()) return setError("Name the track() event this metric measures.");
    start(async () => {
      const body: MetricBody = {
        key: effectiveKey,
        name: name.trim(),
        description: description.trim() || null,
        type,
        eventName: eventName.trim(),
        valueField: usesValue && valueField.trim() ? valueField.trim() : null,
        direction,
      };
      const res = metric
        ? await updateMetricAction(slug, metric.key, body)
        : await createMetricAction(slug, body);
      if (res.error) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="xl">
      <ModalHeader
        title={metric ? "Edit Metric" : "Create Metric"}
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
                disabled={metric != null}
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

          <Field label="Value field">
            <Input
              value={valueField}
              onChange={(e) => setValueField(e.target.value)}
              placeholder="amount"
              className="font-mono"
              disabled={!usesValue}
            />
          </Field>
          <p className="-mt-1 text-xs text-zinc-500">
            {usesValue
              ? "Dot-path into the event properties for the number to sum/average (e.g. amount, order.total). Leave blank to use the event's direct value."
              : "Only sum and mean metrics read a value field."}
          </p>

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
          {pending ? (metric ? "Saving…" : "Creating…") : metric ? "Save" : "Create"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
