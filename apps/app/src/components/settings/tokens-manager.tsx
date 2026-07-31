"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@flagon/design";
import { submitButtonClass } from "@/components/field";
import { FormError, FormNotice } from "@/components/form-error";

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

type CreateResult = { token?: string; error?: string };
type RevokeResult = { error?: string };

// "0" (not "") for no-expiration: Radix Select reserves the empty string. The
// create action treats 0 days as no expiry.
const EXPIRY_OPTIONS = [
  { label: "No expiration", value: "0" },
  { label: "30 days", value: "30" },
  { label: "60 days", value: "60" },
  { label: "90 days", value: "90" },
];

/**
 * Shared access-token UI for personal and organization tokens. The concrete
 * create/revoke server actions are passed in, so the same UI backs both. A newly
 * minted token is shown once, in full, with a copy button.
 */
export function TokensManager({
  tokens,
  createAction,
  revokeAction,
  scopeNote,
}: {
  tokens: TokenRow[];
  createAction: (formData: FormData) => Promise<CreateResult>;
  revokeAction: (formData: FormData) => Promise<RevokeResult>;
  scopeNote: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("0");

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFreshToken(null);
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("expiresInDays", expiry);
    startTransition(async () => {
      const result = await createAction(fd);
      if (result.error) {
        setError(result.error);
        return;
      }
      setFreshToken(result.token ?? null);
      setName("");
      setExpiry("0");
      router.refresh();
    });
  }

  function revoke(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await revokeAction(fd);
      router.refresh();
    });
  }

  async function copy() {
    if (!freshToken) return;
    await navigator.clipboard.writeText(freshToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-5">
      {freshToken ? (
        <div className="flex flex-col gap-2 rounded-lg border border-teal-500/30 bg-teal-500/5 p-4">
          <p className="text-xs font-medium text-teal-200">
            Copy your new token now. You will not be able to see it again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded border border-white/10 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-100">
              {freshToken}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-zinc-200 hover:border-white/20"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={create} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="token-name" className="text-xs font-medium text-zinc-400">
              Token name
            </label>
            <input
              id="token-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI deploy"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-zinc-100 transition outline-none placeholder:text-zinc-500 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-400">Expiration</span>
            <Select
              ariaLabel="Expiration"
              value={expiry}
              onValueChange={setExpiry}
              options={EXPIRY_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`${submitButtonClass} shrink-0 px-4`}
          >
            Generate
          </button>
        </div>
        <p className="text-xs text-zinc-500">{scopeNote}</p>
        {error ? <FormError>{error}</FormError> : null}
      </form>

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
                  {t.prefix}_••••{t.lastFour}
                  <span className="ml-2 font-sans">
                    {t.lastUsedAt
                      ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                      : "never used"}
                    {t.expiresAt
                      ? ` · expires ${new Date(t.expiresAt).toLocaleDateString()}`
                      : ""}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => revoke(t.id)}
                className="text-xs font-medium text-zinc-500 hover:text-red-400 disabled:opacity-50"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <FormNotice>No tokens yet. Generate one above to use the API.</FormNotice>
      )}
    </div>
  );
}
