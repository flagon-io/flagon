"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shield, Trash2 } from "lucide-react";
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
import type { Holdout } from "@/lib/experiments-api";
import { createHoldoutAction, deleteHoldoutAction, updateHoldoutAction } from "../actions";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
}

export function HoldoutsManager({
  slug,
  holdouts,
  environments,
  canManage,
}: {
  slug: string;
  holdouts: Holdout[];
  environments: { key: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();

  const toggle = (h: Holdout) =>
    start(async () => {
      await updateHoldoutAction(slug, h.key, { status: h.status === "active" ? "stopped" : "active" });
      router.refresh();
    });
  const remove = (h: Holdout) => {
    if (!confirm(`Delete holdout "${h.name}"? Its units rejoin experiments.`)) return;
    start(async () => {
      await deleteHoldoutAction(slug, h.key);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-zinc-100">Holdouts</h1>
        <p className="text-sm text-zinc-400">
          A deterministic slice of users held out of every experiment in an environment, served the
          control experience, so you can measure the aggregate impact of your whole experimentation
          program against a clean baseline.
        </p>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Create Holdout
        </Button>
      </div>

      {holdouts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/10 px-6 py-16 text-center">
          <Shield className="size-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-300">No holdouts yet</p>
          <p className="text-sm text-zinc-500">
            Reserve a global control group to measure your program&apos;s true lift.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          {holdouts.map((h, i) => (
            <div
              key={h.id}
              className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-white/8" : ""}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-zinc-100">{h.name}</span>
                <span className="truncate font-mono text-xs text-zinc-500">{h.key}</span>
              </div>
              <div className="hidden text-xs text-zinc-500 sm:block">{h.environment}</div>
              <div className="text-sm font-medium text-zinc-200 tabular-nums">{h.percentage}%</div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => toggle(h)}
                  disabled={pending}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize transition-colors disabled:opacity-40 ${
                    h.status === "active"
                      ? "border-teal-500/30 bg-teal-500/10 text-teal-300"
                      : "border-white/12 bg-white/5 text-zinc-400"
                  }`}
                >
                  {h.status}
                </button>
              ) : (
                <span className="text-xs text-zinc-500 capitalize">{h.status}</span>
              )}
              {canManage ? (
                <button
                  type="button"
                  onClick={() => remove(h)}
                  disabled={pending}
                  className="grid size-9 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-40"
                  aria-label={`Delete ${h.name}`}
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {creating ? (
        <CreateHoldoutModal slug={slug} environments={environments} onClose={() => setCreating(false)} />
      ) : null}
    </div>
  );
}

function CreateHoldoutModal({
  slug,
  environments,
  onClose,
}: {
  slug: string;
  environments: { key: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [key, setKey] = useState("");
  const [environment, setEnvironment] = useState(environments[0]?.key ?? "production");
  const [percentage, setPercentage] = useState("5");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : slugify(name);

  function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the holdout a name.");
    const pct = Number(percentage);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) return setError("Percentage must be 1–100.");
    start(async () => {
      const res = await createHoldoutAction(slug, {
        key: effectiveKey,
        name: name.trim(),
        description: description.trim() || null,
        environment,
        percentage: pct,
      });
      if (res.error) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal onClose={onClose} size="lg">
      <ModalHeader
        title="Create Holdout"
        description="Reserve a global control group held out of all experiments."
        onClose={onClose}
      />
      <ModalBody>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Global holdout" autoFocus />
            </Field>
            <Field label="Key">
              <Input
                value={effectiveKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
                placeholder="global-holdout"
                className="font-mono"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Environment">
              <Select
                value={environment}
                onValueChange={setEnvironment}
                options={environments.map((e) => ({ value: e.key, label: e.name }))}
                ariaLabel="Environment"
              />
            </Field>
            <Field label="Percentage held out">
              <Input
                type="number"
                min={1}
                max={100}
                value={percentage}
                onChange={(e) => setPercentage(e.target.value)}
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="Description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this holdout measures…"
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
