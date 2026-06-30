'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { appPath } from '@/lib/site';
import type { FlagType } from '@/core/types';
import { createFlag } from '../../actions';
import { BOOLEAN_ROWS, VariantsEditor, compileVariants, type VariantRow } from './variants-editor';

type Flag = { id: string; key: string; name: string; type: string; archived: boolean };

const TYPES: { value: FlagType; label: string }[] = [
  { value: 'boolean', label: 'Boolean' },
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'object', label: 'Object (JSON)' },
];

function keyify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export function FlagsSection({
  orgSlug,
  projectId,
  canManage,
  hasEnvironments,
  flags,
}: {
  orgSlug: string;
  projectId: string;
  canManage: boolean;
  hasEnvironments: boolean;
  flags: Flag[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Flags</h2>
        {canManage && hasEnvironments && !adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> New flag
          </Button>
        )}
      </div>

      {!hasEnvironments && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
          Add an environment first. Flags are configured per environment.
        </p>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="New flag"
        description="Define the flag and its variants. Configure per-environment state and targeting after."
        size="xl"
      >
        <CreateFlag
          orgSlug={orgSlug}
          projectId={projectId}
          onDone={(flagId) => {
            setAdding(false);
            if (flagId) router.push(appPath(`/${orgSlug}/projects/${projectId}/flags/${flagId}`));
          }}
        />
      </Modal>

      {flags.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-xl border border-border">
          <ul>
            {flags.map((f) => (
              <li key={f.id} className="border-b border-border last:border-0">
                <Link
                  href={appPath(`/${orgSlug}/projects/${projectId}/flags/${f.id}`)}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-card-muted"
                >
                  <div>
                    <p className="font-medium">{f.name}</p>
                    <p className="font-mono text-xs text-muted">{f.key}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted">{f.type}</span>
                    {f.archived && <Badge variant="neutral">archived</Badge>}
                    <ChevronRight className="size-4 text-muted" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {flags.length === 0 && hasEnvironments && !adding && (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
          No flags yet.
        </p>
      )}
    </section>
  );
}

function CreateFlag({
  orgSlug,
  projectId,
  onDone,
}: {
  orgSlug: string;
  projectId: string;
  onDone: (flagId?: string) => void;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<FlagType>('boolean');
  const [rows, setRows] = useState<VariantRow[]>(BOOLEAN_ROWS);
  const [defaultVariant, setDefaultVariant] = useState('false');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : keyify(name);

  function changeType(t: FlagType) {
    setType(t);
    if (t === 'boolean') {
      setRows(BOOLEAN_ROWS);
      setDefaultVariant('false');
    } else {
      setRows([{ name: '', raw: '' }]);
      setDefaultVariant('');
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const compiled = compileVariants(type, rows);
    if ('error' in compiled) return setError(compiled.error);
    if (!compiled.variants[defaultVariant]) return setError('Pick a default variant.');
    setBusy(true);
    const res = await createFlag(orgSlug, projectId, {
      key: effectiveKey,
      name,
      type,
      variants: compiled.variants,
      defaultVariant,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onDone(res.data.id);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New dashboard" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Key</span>
          <Input
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(keyify(e.target.value));
            }}
            placeholder="new-dashboard"
            className="font-mono"
            required
          />
        </label>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium">Type</span>
        <Select
          value={type}
          onValueChange={(v) => changeType(v as FlagType)}
          ariaLabel="Flag type"
          options={TYPES}
          className="w-48"
        />
      </div>

      <VariantsEditor
        type={type}
        rows={rows}
        onRowsChange={setRows}
        defaultVariant={defaultVariant}
        onDefaultChange={setDefaultVariant}
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          Create flag
        </Button>
      </div>
    </form>
  );
}
