"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
  Textarea,
} from "@flagon/design";
import { createExperimentAction, getFlagVariantsAction } from "./actions";

/** A deployment environment (passed from the server so this stays client-safe). */
type EnvOption = { key: string; name: string };

/** Sentinel for "no primary metric" — Radix Select forbids an empty-string value. */
const NO_METRIC = "__none__";

export function CreateExperimentButton({
  slug,
  flags,
  metrics,
  environments,
}: {
  slug: string;
  flags: { key: string; name: string }[];
  metrics: { key: string; name: string }[];
  environments: EnvOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Create Experiment
      </Button>
      {open ? (
        <CreateExperimentDialog
          slug={slug}
          flags={flags}
          metrics={metrics}
          environments={environments}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

/** Slugify a name into a key candidate, matching the API's slug rules. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function CreateExperimentDialog({
  slug,
  flags,
  metrics,
  environments,
  onClose,
}: {
  slug: string;
  flags: { key: string; name: string }[];
  metrics: { key: string; name: string }[];
  environments: EnvOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [flag, setFlag] = useState("");
  const [environment, setEnvironment] = useState(environments[0]?.key ?? "production");
  const [control, setControl] = useState("");
  const [primaryMetric, setPrimaryMetric] = useState(NO_METRIC);
  const [variants, setVariants] = useState<{ key: string; label: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : slugify(name);

  // Load the chosen flag's variants so the control arm can be picked. All state
  // updates happen in the async continuation (never synchronously in the effect
  // body) — the no-flag case resolves to an empty list rather than clearing inline.
  useEffect(() => {
    let live = true;
    const load = flag ? getFlagVariantsAction(slug, flag) : Promise.resolve([]);
    load.then((vs) => {
      if (!live) return;
      setVariants(vs);
      setControl((prev) => (vs.some((v) => v.key === prev) ? prev : vs[0]?.key ?? ""));
    });
    return () => {
      live = false;
    };
  }, [flag, slug]);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the experiment a name.");
    if (!flag) return setError("Choose the flag whose variants are the arms.");
    start(async () => {
      const res = await createExperimentAction(slug, {
        key: effectiveKey,
        name: name.trim(),
        hypothesis: hypothesis.trim() || null,
        flag,
        environment,
        controlVariantKey: control || null,
        metrics:
          primaryMetric && primaryMetric !== NO_METRIC
            ? [{ key: primaryMetric, role: "primary" }]
            : [],
      });
      if (res.error) return setError(res.error);
      router.push(`/${slug}/experiments/${res.key}`);
      router.refresh();
    });
  }

  const flagOptions = flags.map((f) => ({ value: f.key, label: `${f.name} (${f.key})` }));
  const metricOptions = [
    { value: NO_METRIC, label: "None (set later)" },
    ...metrics.map((m) => ({ value: m.key, label: m.name })),
  ];
  const variantOptions = variants.map((v) => ({
    value: v.key,
    label: v.label ? `${v.label} (${v.key})` : v.key,
  }));

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="Create Experiment"
        description="Turn a flag rollout into a measured A/B test."
        onClose={onClose}
      />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Checkout button color"
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
              placeholder="checkout-button-color"
              className="font-mono"
            />
          </Field>

          <Field label="Hypothesis">
            <Textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="We believe a green button will increase checkout completion…"
              rows={2}
            />
          </Field>

          {flags.length === 0 ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">
              Create a flag first: an experiment measures a flag&apos;s variants.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Flag">
                <Select
                  value={flag}
                  onValueChange={setFlag}
                  options={flagOptions}
                  placeholder="Select a flag"
                  ariaLabel="Flag"
                />
              </Field>
              <Field label="Environment">
                <Select
                  value={environment}
                  onValueChange={setEnvironment}
                  options={environments.map((e) => ({ value: e.key, label: e.name }))}
                  ariaLabel="Environment"
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Control (baseline arm)">
              <Select
                value={control}
                onValueChange={setControl}
                options={variantOptions}
                placeholder={flag ? "Select control" : "Choose a flag first"}
                ariaLabel="Control variant"
                disabled={variants.length === 0}
              />
            </Field>
            <Field label="Primary metric">
              <Select
                value={primaryMetric}
                onValueChange={setPrimaryMetric}
                options={metricOptions}
                ariaLabel="Primary metric"
              />
            </Field>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={submit}
          disabled={pending || !name.trim() || !flag}
        >
          {pending ? "Creating…" : "Create"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
