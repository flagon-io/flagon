'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';
import { createEnvironment, deleteEnvironment, updateEnvironment } from '../actions';

type Env = { id: string; name: string; key: string; color: string };

/** Preset swatches so environments read consistently across the UI. */
const SWATCHES = ['#22c55e', '#f59e0b', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#64748b', '#ec4899'];

export function EnvironmentsManager({
  orgSlug,
  canManage,
  environments,
}: {
  orgSlug: string;
  canManage: boolean;
  environments: Env[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Env | null>(null);
  const [deleting, setDeleting] = useState<Env | null>(null);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
          {environments.length} environment{environments.length === 1 ? '' : 's'}
        </h2>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add environment
          </Button>
        )}
      </div>

      {environments.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted">
          No environments yet. Add one (e.g. Production) to start your catalog.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {environments.map((env) => (
            <li
              key={env.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: env.color }} />
                <div>
                  <p className="font-medium">{env.name}</p>
                  <p className="font-mono text-xs text-muted">{env.key}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" aria-label="Rename" onClick={() => setEditing(env)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete" onClick={() => setDeleting(env)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <EnvFormModal
          orgSlug={orgSlug}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      )}
      {editing && (
        <EnvFormModal
          orgSlug={orgSlug}
          env={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteEnvModal
          orgSlug={orgSlug}
          env={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function EnvFormModal({
  orgSlug,
  env,
  onClose,
  onSaved,
}: {
  orgSlug: string;
  env?: Env;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(env);
  const [name, setName] = useState(env?.name ?? '');
  const [color, setColor] = useState(env?.color ?? SWATCHES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = env
      ? await updateEnvironment(orgSlug, env.id, { name, color })
      : await createEnvironment(orgSlug, { name, color });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Edit environment' : 'Add environment'}
      description={
        editing
          ? 'Rename or recolor this environment. Its key is fixed once created.'
          : 'Environments apply to every project. Adding one gives every flag a config in it.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="env-form" disabled={busy || !name.trim()}>
            {editing ? 'Save changes' : 'Create environment'}
          </Button>
        </>
      }
    >
      <form id="env-form" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Production" />
          {!editing && (
            <span className="mt-1 block font-mono text-xs text-muted">
              key: {keyPreview(name) || 'production'}
            </span>
          )}
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Color</span>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  'size-7 rounded-full border-2 transition-transform',
                  color === c ? 'scale-110 border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
    </Modal>
  );
}

function DeleteEnvModal({
  orgSlug,
  env,
  onClose,
  onDeleted,
}: {
  orgSlug: string;
  env: Env;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await deleteEnvironment(orgSlug, env.id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDeleted();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Delete ${env.name}?`}
      description="This removes the environment from every project, along with anything a capability has attached to it. This can't be undone."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>
            Delete environment
          </Button>
        </>
      }
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
    </Modal>
  );
}

/** Mirror the server's keyify() closely enough for a live preview. */
function keyPreview(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
