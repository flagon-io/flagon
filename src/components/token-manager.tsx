"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { SkeletonRows } from "@/components/skeleton";
import { Button, Field, Input } from "@/components/form-controls";
import { Modal, ModalActions, ModalClose } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

/**
 * Create, rotate, and revoke access tokens. Shared by the organization token
 * page and the personal access token page, because the two differ only in
 * which endpoint they talk to and whose authority the token carries.
 *
 * The secret is shown exactly once, on creation and on rotation. There is no
 * way to recover it afterwards: only a hash is stored, so "show it again"
 * would require keeping the plaintext, which is the thing this design exists
 * to avoid.
 */
export type TokenRow = {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const relative = (iso: string | null) =>
  iso ? dateFormat.format(new Date(iso)) : "Never used";

export function TokenManager({
  endpoint,
  scopeLabels,
  defaultScopes = [],
  emptyLabel,
  createLabel,
  namePlaceholder,
}: {
  /** Collection URL; items are `${endpoint}/${id}`. */
  endpoint: string;
  /** Offered scopes, in order, as [scope, human label]. */
  scopeLabels: [string, string][];
  defaultScopes?: string[];
  emptyLabel: string;
  createLabel: string;
  namePlaceholder: string;
}) {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [scopes, setScopes] = useState<string[]>(defaultScopes);

  // Loaded on demand rather than server-rendered: a token list is small, and
  // this keeps the component drop-in on any page without a data prop.
  //
  // In an effect, NOT during render. Fetching in the render body fires before
  // the component has mounted and updates state on something React has not
  // finished creating; it also re-fires on every render. The cancel flag stops
  // a late response from a previous endpoint landing after a newer one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Every exit resolves the list. `tokens === null` is what renders the
      // skeleton, so a throw from fetch or json() that leaves it null strands
      // the panel on loading rows forever, which looks identical to a slow
      // network and never recovers. An offline browser gets an error and an
      // empty list, not a permanent spinner.
      let next: TokenRow[] = [];
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          next = await response.json();
        } else if (!cancelled) {
          setError("Could not load tokens.");
        }
      } catch {
        if (!cancelled) setError("Could not load tokens.");
      }
      if (!cancelled) setTokens(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const create = async (form: FormData) => {
    setError(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), scopes }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setError(body?.message ?? "Could not create that token.");
      return false;
    }
    setSecret(body.token);
    setTokens((items) => [body, ...(items ?? [])]);
    setScopes(defaultScopes);
    return true;
  };

  const rotate = async (id: string) => {
    const response = await fetch(`${endpoint}/${id}`, { method: "PATCH" });
    if (!response.ok) return;
    const body = await response.json();
    setSecret(body.token);
    setTokens((items) =>
      (items ?? []).map((item) => (item.id === id ? { ...item, ...body } : item)),
    );
  };

  const revoke = async (id: string) => {
    if (!(await fetch(`${endpoint}/${id}`, { method: "DELETE" })).ok) return;
    setTokens((items) => (items ?? []).filter((item) => item.id !== id));
  };

  return (
    <div>
      {secret ? (
        <div className="mb-5 border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="mb-3 text-xs font-medium text-amber-300">
            Copy this token now. It cannot be shown again.
          </p>
          <CopyField value={secret} label="Access token" tone="warning" />
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-zinc-500">{emptyLabel}</p>
        <Modal
          open={open}
          onOpenChange={setOpen}
          title={createLabel}
          description="Grant only the scopes this token needs. A write scope includes its matching read scope."
          trigger={
            <Button variant="secondary" size="sm" className="shrink-0 gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New token
            </Button>
          }
        >
          <form
            action={async (form) => {
              if (await create(form)) setOpen(false);
            }}
            className="grid gap-5"
          >
            <Field
              label="Name"
              hint="Use a name that identifies where this token is deployed."
            >
              <Input name="name" required autoFocus placeholder={namePlaceholder} />
            </Field>

            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-zinc-400">Scopes</span>
              <div className="max-h-56 overflow-y-auto border border-white/10 bg-black/20 p-1">
                {scopeLabels.map(([scope, label]) => (
                  <label
                    key={scope}
                    className="flex cursor-pointer items-start gap-2.5 px-2 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={scopes.includes(scope)}
                      onChange={(event) =>
                        setScopes((current) =>
                          event.target.checked
                            ? [...current, scope]
                            : current.filter((item) => item !== scope),
                        )
                      }
                      className="mt-0.5 accent-teal-500"
                    />
                    <span className="min-w-0">
                      <span className="font-mono text-xs text-zinc-200">{scope}</span>
                      <span className="block text-xs text-zinc-600">{label}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!scopes.length ? (
                <span className="text-xs text-amber-400">
                  Choose at least one scope.
                </span>
              ) : null}
            </div>

            {error ? <p className="text-xs text-red-400">{error}</p> : null}

            <ModalActions>
              <ModalClose />
              <SubmitButton pendingLabel="Creating…" disabled={!scopes.length}>
                Create token
              </SubmitButton>
            </ModalActions>
          </form>
        </Modal>
      </div>

      {tokens === null ? (
        <SkeletonRows rows={2} className="mt-4" />
      ) : (
      <ul className="mt-4 divide-y divide-white/5 border border-white/10">
        {tokens.map((token) => (
          <li key={token.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">{token.name}</p>
              <p className="mt-0.5 font-mono text-xs text-zinc-600">
                {token.scopes.join("  ")}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Created {dateFormat.format(new Date(token.created_at))} ·{" "}
                {relative(token.last_used_at)}
                {token.expires_at
                  ? ` · Expires ${dateFormat.format(new Date(token.expires_at))}`
                  : ""}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => rotate(token.id)}>
              Rotate
            </Button>
            <Button variant="danger" size="sm" onClick={() => revoke(token.id)}>
              Revoke
            </Button>
          </li>
        ))}
        {!tokens.length ? (
          <li className="px-4 py-6 text-center text-sm text-zinc-600">
            No tokens yet.
          </li>
        ) : null}
      </ul>
      )}
    </div>
  );
}
