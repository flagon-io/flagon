"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
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
} from "@flagon/design";
import {
  createSdkKeyAction,
  revokeSdkKeyAction,
  updateSdkKeyAction,
} from "../actions";
import type { Environment, SdkKey } from "@/lib/flags-api";

function relativeTime(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

/**
 * Client keys, grouped by the fixed environments (Production, Preview,
 * Development). Any number of keys per environment. Creation is a modal
 * (environment + label). Client keys are PUBLISHABLE, so they stay fully
 * retrievable here: each row reveals + copies its key on demand. Legacy keys
 * minted before keys were stored (null token) show masked and are copy-disabled.
 */
export function ClientKeysManager({
  slug,
  environments,
  keys,
  canManage,
}: {
  slug: string;
  environments: Environment[];
  keys: SdkKey[];
  /** Owners/admins mint and revoke keys; members get a read-only view. */
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [modalEnv, setModalEnv] = useState<string | null>(null);

  function revoke(id: string) {
    start(async () => {
      const res = await revokeSdkKeyAction(slug, id);
      if (!res.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {canManage ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setModalEnv(environments[0]?.key ?? "")}>
            <Plus className="size-4" /> Create Client Key
          </Button>
        </div>
      ) : null}

      {environments.map((env) => {
        const envKeys = keys.filter((k) => k.environmentKey === env.key && !k.revokedAt);
        return (
          <section key={env.key}>
            <h2 className="mb-2.5 text-sm font-semibold text-zinc-100">{env.name}</h2>
            <div className="overflow-hidden rounded-xl border border-white/8 bg-white/2">
              {envKeys.length === 0 ? (
                <div className="flex items-center justify-between p-4">
                  <span className="text-sm text-zinc-500">No client keys for {env.name}</span>
                  {canManage ? (
                    <Button variant="secondary" size="sm" onClick={() => setModalEnv(env.key)}>
                      <Plus className="size-3.5" /> Create Client Key
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  {envKeys.map((k, i) => (
                    <KeyRow
                      key={k.id}
                      slug={slug}
                      k={k}
                      divided={i > 0}
                      canManage={canManage}
                      pending={pending}
                      onRevoke={() => revoke(k.id)}
                    />
                  ))}
                  {canManage ? (
                    <div className="border-t border-white/6 px-2.5 py-2">
                      <Button variant="secondary" size="sm" onClick={() => setModalEnv(env.key)}>
                        <Plus className="size-3.5" /> Create Client Key
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        );
      })}

      <p className="rounded-lg border border-white/8 bg-white/2 px-4 py-3 text-xs/relaxed text-zinc-500">
        Client keys are publishable: they ship in your app and can be retrieved here
        any time. Use one with the OpenFeature OFREP provider (or a plain POST to{" "}
        <code className="font-mono text-zinc-400">/ofrep/v1/evaluate/flags</code>) to
        evaluate flags in that environment. Revoke a key to rotate it.{" "}
        <span className="text-zinc-400">Auto exposures</span> logs one billable
        exposure per user, flag, and variant each hour so you get usage and
        experiment analysis automatically; turn it off for a key to only bill
        exposures you send yourself.
      </p>

      {modalEnv !== null ? (
        <CreateKeyModal
          slug={slug}
          environments={environments}
          initialEnv={modalEnv || environments[0]?.key || ""}
          onClose={() => {
            setModalEnv(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function KeyRow({
  slug,
  k,
  divided,
  canManage,
  pending,
  onRevoke,
}: {
  slug: string;
  k: SdkKey;
  divided: boolean;
  canManage: boolean;
  pending: boolean;
  onRevoke: () => void;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(k.name);
  const [savingLabel, saveLabel] = useTransition();
  const [savingExpose, saveExpose] = useTransition();
  const hasToken = Boolean(k.token);
  const shown = hasToken && revealed ? (k.token as string) : k.masked;

  function toggleExpose(next: boolean) {
    if (next === k.autoExpose) return;
    saveExpose(async () => {
      const res = await updateSdkKeyAction(slug, k.id, { autoExpose: next });
      if (!res.error) router.refresh();
    });
  }

  function copy() {
    if (!k.token) return;
    navigator.clipboard.writeText(k.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function commitLabel() {
    setEditing(false);
    const next = labelDraft.trim();
    if (next === k.name) return;
    saveLabel(async () => {
      const res = await updateSdkKeyAction(slug, k.id, { name: next });
      if (!res.error) router.refresh();
    });
  }

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 ${
        divided ? "border-t border-white/6" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setLabelDraft(k.name);
                setEditing(false);
              }
            }}
            placeholder="Unlabelled key"
            className="h-7 max-w-xs px-2 py-0.5 text-sm"
          />
        ) : (
          <button
            type="button"
            onClick={() => canManage && setEditing(true)}
            disabled={!canManage}
            className="group flex max-w-full items-center gap-1.5 text-left"
          >
            <span
              className={`truncate text-sm ${k.name ? "text-zinc-100" : "text-zinc-500 italic"}`}
            >
              {k.name || "Unlabelled key"}
            </span>
            {canManage ? (
              <Pencil className="size-3 shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
            ) : null}
          </button>
        )}

        <div className="mt-1 flex items-center gap-1.5">
          <code className="min-w-0 flex-1 truncate rounded bg-black/30 px-2 py-1 font-mono text-xs text-zinc-300">
            {shown}
          </code>
          {hasToken ? (
            <>
              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                title={revealed ? "Hide" : "Reveal"}
                className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={copy}
                title="Copy"
                className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                {copied ? (
                  <Check className="size-3.5 text-teal-400" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </>
          ) : null}
        </div>

        <p className="mt-1.5 text-xs text-zinc-600">
          {savingLabel
            ? "Saving…"
            : k.lastUsedAt
              ? `Last used ${relativeTime(k.lastUsedAt)}`
              : "Never used"}
          <span className="text-zinc-700"> · Added {relativeTime(k.createdAt)}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-[10px] font-medium tracking-wide text-zinc-600 uppercase">
          Auto exposures
        </span>
        {canManage ? (
          <SegmentedControl
            size="sm"
            sizing="content"
            value={k.autoExpose ? "on" : "off"}
            onValueChange={(v) => toggleExpose(v === "on")}
            options={[
              { value: "on", label: "On" },
              { value: "off", label: "Off" },
            ]}
            ariaLabel="Auto-log exposures"
            className={savingExpose ? "pointer-events-none opacity-60" : ""}
          />
        ) : (
          <span className="text-xs text-zinc-400">{k.autoExpose ? "On" : "Off"}</span>
        )}
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={onRevoke}
          disabled={pending}
          title="Revoke"
          className="grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

function CreateKeyModal({
  slug,
  environments,
  initialEnv,
  onClose,
}: {
  slug: string;
  environments: Environment[];
  initialEnv: string;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [environment, setEnvironment] = useState(initialEnv);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    start(async () => {
      // An empty label is fine; the key shows as "Unlabelled" and can be named later.
      const res = await createSdkKeyAction(slug, label.trim(), environment);
      if (res.error) return setError(res.error);
      // Retrievable keys: no one-time reveal. Close and let the list show it.
      onClose();
    });
  }

  return (
    <Modal onClose={onClose} size="md">
      <ModalHeader
        title="Create Client Key"
        description="Use client keys to evaluate flags from your application."
        onClose={onClose}
      />
      <ModalBody className="flex flex-col gap-4">
        <Field label="Environment">
          <Select
            value={environment}
            onValueChange={setEnvironment}
            options={environments.map((env) => ({ value: env.key, label: env.name }))}
            ariaLabel="Environment"
            className="w-full"
          />
        </Field>
        <Field label="Label (optional)">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. web client"
          />
        </Field>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={create} disabled={pending}>
          {pending ? "Creating…" : "Create Key"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
