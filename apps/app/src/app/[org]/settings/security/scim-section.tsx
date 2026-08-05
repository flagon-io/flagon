"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Switch, toast, useConfirm } from "@flagon/design";
import { FormError } from "@/components/form-error";
import { CopyField } from "@/components/settings/copy-field";
import {
  createScimTokenAction,
  revokeScimTokenAction,
  updateSecurityAction,
} from "./actions";

export type ScimTokenRow = {
  id: string;
  name: string;
  lastFour: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

/**
 * SCIM provisioning, the analog of GitHub's "Team synchronization": let the IdP
 * push members in and out. Enabling exposes the SCIM base URL and a bearer-token
 * manager. A minted token is shown once; deactivating a user at the IdP removes
 * their org membership but never their personal Flagon account.
 */
export function ScimSection({
  slug,
  canManage,
  scimEnabled,
  scimBaseUrl,
  tokens,
}: {
  slug: string;
  canManage: boolean;
  scimEnabled: boolean;
  scimBaseUrl: string;
  tokens: ScimTokenRow[];
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [enabled, setEnabled] = useState(scimEnabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggle(next: boolean) {
    if (!canManage) return;
    const previous = enabled;
    setEnabled(next);
    start(async () => {
      const res = await updateSecurityAction(slug, { scimEnabled: next });
      if (res.error) {
        setEnabled(previous);
        toast.error("Couldn't update SCIM", res.error);
      } else {
        toast.success(next ? "SCIM enabled" : "SCIM disabled");
        router.refresh();
      }
    });
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFresh(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    start(async () => {
      const res = await createScimTokenAction(slug, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setFresh(res.token ?? null);
      setName("");
      router.refresh();
    });
  }

  async function revoke(token: ScimTokenRow) {
    if (
      !(await confirm({
        title: "Revoke SCIM token?",
        message: (
          <>
            <strong className="text-zinc-200">{token.name}</strong> will stop
            working immediately. Your identity provider will no longer be able to
            provision members until you issue a new token.
          </>
        ),
        confirmLabel: "Revoke token",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      const res = await revokeScimTokenAction(slug, token.id);
      if (res?.error) {
        toast.error("Couldn't revoke token", res.error);
        return;
      }
      router.refresh();
    });
  }

  async function copyFresh() {
    if (!fresh) return;
    await navigator.clipboard.writeText(fresh);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-zinc-100">Enable SCIM provisioning</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Let your identity provider create, update, and deactivate members
            automatically. Deactivating removes org membership, not the account.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={toggle}
          disabled={!canManage || pending}
          ariaLabel="Enable SCIM provisioning"
        />
      </div>

      {enabled ? (
        <>
          <CopyField label="SCIM base URL" value={scimBaseUrl} />

          {fresh ? (
            <div className="flex flex-col gap-2 rounded-lg border border-teal-500/30 bg-teal-500/5 p-4">
              <p className="text-xs font-medium text-teal-200">
                Copy your SCIM token now. You will not be able to see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-xs whitespace-nowrap text-zinc-100">
                  {fresh}
                </code>
                <button
                  type="button"
                  onClick={copyFresh}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:border-white/20"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}

          {canManage ? (
            <form onSubmit={create} className="flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <Field label="New provisioning token" htmlFor="scim-token-name">
                  <Input
                    id="scim-token-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Okta production"
                  />
                </Field>
              </div>
              <Button type="submit" variant="secondary" disabled={pending}>
                Generate
              </Button>
            </form>
          ) : null}
          {error ? <FormError>{error}</FormError> : null}

          {tokens.length > 0 ? (
            <ul className="flex flex-col divide-y divide-white/8 rounded-lg border border-white/8">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-100">{t.name}</p>
                    <p className="font-mono text-xs text-zinc-500">
                      flagon_scim_••••{t.lastFour}
                      <span className="ml-2 font-sans">
                        {t.lastUsedAt
                          ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                          : "never used"}
                      </span>
                    </p>
                  </div>
                  {canManage ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => revoke(t)}
                      className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-zinc-500">
              No SCIM tokens yet. Generate one and paste it into your identity
              provider.
            </p>
          )}
        </>
      ) : null}
      {confirmDialog}
    </div>
  );
}
