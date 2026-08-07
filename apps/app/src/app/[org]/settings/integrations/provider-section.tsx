"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, toast, useConfirm } from "@flagon/design";
import { FormError } from "@/components/form-error";
import { WEB_URL } from "@/lib/urls";
import type { IntegrationCatalogEntry } from "@/lib/integrations-api";
import {
  configureIntegrationAction,
  removeIntegrationAction,
  testIntegrationAction,
} from "./actions";

/**
 * One bring-your-own provider card. Renders entirely from the catalog entry's
 * `fields`, so every provider (Twilio today, more later) uses this same UI with
 * no bespoke code. Secret fields are write-only: they submit but never come back,
 * so reconfiguring means re-entering them.
 */
export function ProviderSection({
  slug,
  entry,
  canManage,
  secretsEnabled,
}: {
  slug: string;
  entry: IntegrationCatalogEntry;
  canManage: boolean;
  secretsEnabled: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const integration = entry.integration;
  const connected = Boolean(integration?.connected);
  // Human-readable summary of what we detected the sender can actually do.
  const detected = Array.isArray(integration?.config?.detected)
    ? (integration.config.detected as string[])
    : null;
  const CAP_LABELS: Record<string, string> = { sms: "SMS", voice: "Voice" };
  const detectedLabel = detected
    ? detected.length > 0
      ? detected.map((c) => CAP_LABELS[c] ?? c).join(", ")
      : "Nothing usable (check the sender)"
    : "";
  // Show the form when nothing is configured yet, or when the user opts to edit.
  const [editing, setEditing] = useState(!integration);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of entry.fields) {
      if (!f.secret) seed[f.key] = String(integration?.config?.[f.key] ?? "");
    }
    return seed;
  });

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    start(async () => {
      const res = await configureIntegrationAction(slug, entry.key, values);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.integration?.status === "connected") {
        toast.success(`${entry.label} connected`);
      } else {
        toast.error(
          `${entry.label} saved, but the test failed`,
          res.integration?.lastError ?? undefined,
        );
      }
      setEditing(false);
      // Clear entered secrets from component state once saved.
      setValues((v) => {
        const next = { ...v };
        for (const f of entry.fields) if (f.secret) delete next[f.key];
        return next;
      });
      router.refresh();
    });
  }

  function test() {
    start(async () => {
      const res = await testIntegrationAction(slug, entry.key);
      if (res.error) {
        toast.error(`Couldn't test ${entry.label}`, res.error);
        return;
      }
      if (res.ok) toast.success(`${entry.label} is reachable`);
      else toast.error(`${entry.label} test failed`, res.message);
      router.refresh();
    });
  }

  async function remove() {
    if (
      !(await confirm({
        title: `Disconnect ${entry.label}?`,
        message: (
          <>
            Flagon will stop using your {entry.label} account and delete the stored
            credentials. You can reconnect anytime by re-entering them.
          </>
        ),
        confirmLabel: "Disconnect",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      const res = await removeIntegrationAction(slug, entry.key);
      if (res.error) {
        toast.error(`Couldn't disconnect ${entry.label}`, res.error);
        return;
      }
      setEditing(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <StatusPill integration={integration} />
        {entry.docsPath ? (
          <a
            href={`${WEB_URL}${entry.docsPath}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-teal-300 hover:text-teal-200"
          >
            Read the setup guide ↗
          </a>
        ) : null}
      </div>

      {!secretsEnabled ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
          Secret storage isn&apos;t configured on this deployment yet, so
          credentials can&apos;t be saved. Set <code>INTEGRATIONS_SECRET_KEY</code>{" "}
          on the API to enable it.
        </p>
      ) : null}

      {connected && !editing ? (
        <dl className="grid gap-1.5 rounded-lg border border-white/8 bg-white/2 px-4 py-3 text-xs">
          {entry.fields.map((f) => {
            const shown = f.secret
              ? integration?.hints?.[f.key]
                ? `••••${integration.hints[f.key]}`
                : "••••"
              : String(integration?.config?.[f.key] ?? "—");
            return (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <dt className="text-zinc-500">{f.label}</dt>
                <dd className="truncate font-mono text-zinc-300">{shown}</dd>
              </div>
            );
          })}
          {detectedLabel ? (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">Sender supports</dt>
              <dd className="text-zinc-300">{detectedLabel}</dd>
            </div>
          ) : null}
          {integration?.lastError ? (
            <div className="mt-1 text-amber-300">{integration.lastError}</div>
          ) : null}
        </dl>
      ) : null}

      {editing ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          {entry.fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              htmlFor={`${entry.key}-${f.key}`}
              hint={f.help}
            >
              <Input
                id={`${entry.key}-${f.key}`}
                type={f.secret ? "password" : f.type === "tel" ? "tel" : "text"}
                required={f.required}
                autoComplete="off"
                placeholder={f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                disabled={!canManage || !secretsEnabled}
              />
            </Field>
          ))}
          {error ? <FormError>{error}</FormError> : null}
          <div className="flex items-center justify-end gap-2">
            {integration ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={pending || !canManage || !secretsEnabled}
            >
              {integration ? "Save credentials" : `Connect ${entry.label}`}
            </Button>
          </div>
        </form>
      ) : null}

      {connected && !editing && canManage ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="mr-auto text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
          >
            Disconnect
          </button>
          <Button type="button" variant="secondary" disabled={pending} onClick={test}>
            Test connection
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            Update credentials
          </Button>
        </div>
      ) : null}
      {confirmDialog}
    </div>
  );
}

function StatusPill({
  integration,
}: {
  integration: IntegrationCatalogEntry["integration"];
}) {
  if (!integration) {
    return (
      <span className="shrink-0 rounded-full border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-500 uppercase">
        Not connected
      </span>
    );
  }
  if (integration.status === "connected") {
    return (
      <span className="shrink-0 rounded-full border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal-300 uppercase">
        Connected
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber-300 uppercase">
      Needs attention
    </span>
  );
}
