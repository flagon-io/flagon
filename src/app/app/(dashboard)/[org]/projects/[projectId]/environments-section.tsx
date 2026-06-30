'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Plus, Rocket, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import {
  createEnvironment,
  createSdkKey,
  publish,
  revokeSdkKey,
} from '../../actions';

type Env = { id: string; name: string; key: string; color: string };
type Key = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  environmentId: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

export function EnvironmentsSection({
  orgSlug,
  projectId,
  canManage,
  environments,
  sdkKeys,
}: {
  orgSlug: string;
  projectId: string;
  canManage: boolean;
  environments: Env[];
  sdkKeys: Key[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const refresh = () => router.refresh();

  async function addEnv(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createEnvironment(orgSlug, projectId, { name });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setName('');
    setAdding(false);
    refresh();
  }

  function closeAdd() {
    setAdding(false);
    setError(null);
  }

  async function doPublish(envId: string) {
    setNote((n) => ({ ...n, [envId]: 'Publishing…' }));
    const res = await publish(orgSlug, envId);
    setNote((n) => ({
      ...n,
      [envId]: res.ok ? `Published ${res.data.flagCount} flag(s) · ${res.data.etag}` : res.error,
    }));
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Environments</h2>
        {canManage && !adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add environment
          </Button>
        )}
      </div>

      <Modal
        open={adding}
        onClose={closeAdd}
        title="Add environment"
        description="Environments (e.g. Production, Staging) each get their own flag config and SDK keys."
        footer={
          <>
            <Button variant="ghost" onClick={closeAdd}>
              Cancel
            </Button>
            <Button type="submit" form="add-env-form" disabled={busy || !name.trim()}>
              Create environment
            </Button>
          </>
        }
      >
        <form id="add-env-form" onSubmit={addEnv}>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Name</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
          </label>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </form>
      </Modal>

      {environments.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
          No environments yet. Add one (e.g. Production) to start serving flags.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {environments.map((env) => (
            <EnvironmentCard
              key={env.id}
              env={env}
              orgSlug={orgSlug}
              canManage={canManage}
              keys={sdkKeys.filter((k) => k.environmentId === env.id)}
              note={note[env.id]}
              onPublish={() => doPublish(env.id)}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EnvironmentCard({
  env,
  orgSlug,
  canManage,
  keys,
  note,
  onPublish,
  onChanged,
}: {
  env: Env;
  orgSlug: string;
  canManage: boolean;
  keys: Key[];
  note?: string;
  onPublish: () => void;
  onChanged: () => void;
}) {
  const [showKeys, setShowKeys] = useState(false);
  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: env.color }} />
          <div>
            <p className="font-medium">{env.name}</p>
            <p className="font-mono text-xs text-muted">{env.key}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowKeys((s) => !s)}>
            <KeyRound className="size-3.5" /> {activeKeys.length} key{activeKeys.length === 1 ? '' : 's'}
          </Button>
          {canManage && (
            <Button size="sm" variant="secondary" onClick={onPublish}>
              <Rocket className="size-3.5" /> Publish
            </Button>
          )}
        </div>
      </div>
      {note && <p className="border-t border-border px-4 py-2 font-mono text-xs text-muted">{note}</p>}
      {showKeys && (
        <SdkKeys orgSlug={orgSlug} envId={env.id} canManage={canManage} keys={keys} onChanged={onChanged} />
      )}
    </div>
  );
}

function SdkKeys({
  orgSlug,
  envId,
  canManage,
  keys,
  onChanged,
}: {
  orgSlug: string;
  envId: string;
  canManage: boolean;
  keys: Key[];
  onChanged: () => void;
}) {
  const [scope, setScope] = useState<'server' | 'client'>('server');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true);
    const res = await createSdkKey(orgSlug, envId, { name, scope });
    setBusy(false);
    if (res.ok) {
      setCreated(res.data.plaintext);
      setName('');
      onChanged();
    }
  }

  async function copy() {
    if (!created) return;
    await navigator.clipboard?.writeText(created);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border-t border-border bg-card-muted/40 p-4">
      {created && (
        <div className="mb-3 rounded-lg border border-brand-500/30 bg-brand-500/10 p-3">
          <p className="text-xs text-muted">Copy this key now. It won&rsquo;t be shown again.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{created}</code>
            <Button size="sm" variant="secondary" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="text-xs text-muted">No SDK keys yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <code className={cn('font-mono text-xs', k.revokedAt && 'text-muted line-through')}>
                  {k.prefix}…
                </code>
                <span className="text-muted">{k.name}</span>
                <Badge variant={k.scope === 'server' ? 'neutral' : 'brand'}>{k.scope}</Badge>
                {k.revokedAt && <Badge variant="danger">revoked</Badge>}
              </div>
              {canManage && !k.revokedAt && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Revoke key"
                  onClick={async () => {
                    await revokeSdkKey(orgSlug, k.id);
                    onChanged();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Key name"
            className="h-9 w-40"
          />
          <Select
            value={scope}
            onValueChange={(v) => setScope(v as 'server' | 'client')}
            ariaLabel="Key scope"
            options={[
              { value: 'server', label: 'Server' },
              { value: 'client', label: 'Client' },
            ]}
            className="w-32"
          />
          <Button size="md" variant="secondary" onClick={create} disabled={busy}>
            Create key
          </Button>
        </div>
      )}
    </div>
  );
}
