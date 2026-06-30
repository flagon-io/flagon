'use client';

/**
 * Shared API-token management UI (reveal-once + list + revoke), used by both the
 * user PAT section and the org-token section. Mirrors the SDK-key reveal pattern:
 * the plaintext is shown once in a branded alert with a copy button, never again.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export type TokenView = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  role?: string | null;
  scopes?: string[] | null;
};

type CreateResult = { ok: true; data: { plaintext: string } } | { ok: false; error: string };

const EXPIRY = [
  { value: '0', label: 'No expiry' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
];

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function TokenManager({
  title,
  description,
  tokens,
  canManage = true,
  roleOptions,
  defaultRole,
  scopeOptions,
  onCreate,
  onRevoke,
}: {
  title: string;
  description: string;
  tokens: TokenView[];
  canManage?: boolean;
  roleOptions?: { value: string; label: string }[];
  defaultRole?: string;
  scopeOptions?: { value: string; label: string }[];
  onCreate: (input: {
    name: string;
    expiresInDays: number | null;
    role?: string;
    scopes?: string[];
  }) => Promise<CreateResult>;
  onRevoke: (id: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [expiry, setExpiry] = useState('0');
  const [role, setRole] = useState(defaultRole ?? roleOptions?.[0]?.value ?? '');
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleScope(value: string) {
    setScopes((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await onCreate({
      name,
      expiresInDays: Number(expiry) || null,
      ...(roleOptions ? { role } : {}),
      ...(scopeOptions ? { scopes } : {}),
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setCreated(res.data.plaintext);
    setName('');
    setExpiry('0');
    setScopes([]);
    router.refresh();
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard?.writeText(created);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function revoke(id: string) {
    await onRevoke(id);
    router.refresh();
  }

  const now = Date.now();

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      <div className="mt-4 space-y-4">
        {created && (
          <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-3">
            <p className="text-xs text-muted">Copy this token now. It won&rsquo;t be shown again.</p>
            <div className="mt-1.5 flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{created}</code>
              <Button size="sm" variant="secondary" onClick={copy} aria-label="Copy token">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </div>
        )}

        {tokens.length === 0 ? (
          <p className="text-sm text-muted">No tokens yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {tokens.map((t) => {
              const expired = !!t.expiresAt && new Date(t.expiresAt).getTime() <= now;
              const inactive = !!t.revokedAt || expired;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      {t.role && <Badge variant="neutral">{t.role}</Badge>}
                      {t.scopes && t.scopes.length > 0 && <Badge variant="brand">scoped</Badge>}
                      {t.revokedAt && <Badge variant="danger">revoked</Badge>}
                      {!t.revokedAt && expired && <Badge variant="warning">expired</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <code className={cn('font-mono', inactive && 'line-through')}>{t.prefix}…</code>
                      <span>·</span>
                      <span>{t.lastUsedAt ? `Last used ${fmtDate(t.lastUsedAt)}` : 'Never used'}</span>
                      {t.expiresAt && !expired && (
                        <>
                          <span>·</span>
                          <span>Expires {fmtDate(t.expiresAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {canManage && !t.revokedAt && (
                    <Button size="icon" variant="ghost" aria-label="Revoke token" onClick={() => revoke(t.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canManage && (
          <form onSubmit={create} className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Token name"
                className="h-9 w-48"
              />
              {roleOptions && (
                <Select value={role} onValueChange={setRole} ariaLabel="Token role" options={roleOptions} className="w-36" />
              )}
              <Select value={expiry} onValueChange={setExpiry} ariaLabel="Token expiry" options={EXPIRY} className="w-36" />
            </div>
            {scopeOptions && (
              <details className="rounded-lg border border-border bg-card-muted/40 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-muted">
                  {scopes.length
                    ? `Scopes (${scopes.length} selected)`
                    : 'Scopes (optional, none selected = full access)'}
                </summary>
                <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                  {scopeOptions.map((s) => (
                    <label key={s.value} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={scopes.includes(s.value)}
                        onChange={() => toggleScope(s.value)}
                        className="size-3.5 accent-brand-500"
                      />
                      <span className="text-muted">{s.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
                Create token
              </Button>
              {error && <span className="self-center text-sm text-red-400">{error}</span>}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
