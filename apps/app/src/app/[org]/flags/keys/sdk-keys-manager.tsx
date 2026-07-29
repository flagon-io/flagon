"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Select,
} from "@flagon/design";
import { createSdkKeyAction, revokeSdkKeyAction } from "../actions";
import type { Environment, SdkKey } from "@/lib/flags-api";

/**
 * Client keys, grouped by the fixed environments (Production, Preview,
 * Development). Any number of keys per environment. Creation is a modal
 * (environment + label). Client keys are PUBLISHABLE, so they stay fully
 * retrievable here: each row reveals + copies its key on demand. Legacy keys
 * minted before keys were stored (null token) show masked and are copy-disabled.
 */
export function SdkKeysManager({
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
            <Plus className="h-4 w-4" /> Create Client Key
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
                <div className="flex items-center justify-between px-4 py-4">
                  <span className="text-sm text-zinc-500">No client keys for {env.name}</span>
                  {canManage ? (
                    <Button variant="secondary" size="sm" onClick={() => setModalEnv(env.key)}>
                      <Plus className="h-3.5 w-3.5" /> Create Client Key
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  {envKeys.map((k, i) => (
                    <KeyRow
                      key={k.id}
                      k={k}
                      divided={i > 0}
                      canManage={canManage}
                      pending={pending}
                      onRevoke={() => revoke(k.id)}
                    />
                  ))}
                  {canManage ? (
                    <div className="border-t border-white/6 px-2.5 py-2">
                      <Button variant="ghost" size="sm" onClick={() => setModalEnv(env.key)}>
                        <Plus className="h-3.5 w-3.5" /> Create Client Key
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        );
      })}

      <p className="rounded-lg border border-white/8 bg-white/2 px-4 py-3 text-xs leading-relaxed text-zinc-500">
        Client keys are publishable: they ship in your app and can be retrieved here
        any time. Use one with the OpenFeature OFREP provider (or a plain POST to{" "}
        <code className="font-mono text-zinc-400">/ofrep/v1/evaluate/flags</code>) to
        evaluate flags in that environment. Revoke a key to rotate it.
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
  k,
  divided,
  canManage,
  pending,
  onRevoke,
}: {
  k: SdkKey;
  divided: boolean;
  canManage: boolean;
  pending: boolean;
  onRevoke: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasToken = Boolean(k.token);
  const shown = hasToken && revealed ? (k.token as string) : k.masked;

  function copy() {
    if (!k.token) return;
    navigator.clipboard.writeText(k.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3 ${
        divided ? "border-t border-white/6" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-100">{k.name}</p>
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
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={copy}
                title="Copy"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-teal-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-zinc-600">
          {k.lastUsedAt
            ? `Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
            : "Never used"}
        </p>
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={onRevoke}
          disabled={pending}
          title="Revoke"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
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
    const envName = environments.find((e) => e.key === environment)?.name ?? "Client";
    start(async () => {
      const res = await createSdkKeyAction(slug, label.trim() || `${envName} key`, environment);
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
