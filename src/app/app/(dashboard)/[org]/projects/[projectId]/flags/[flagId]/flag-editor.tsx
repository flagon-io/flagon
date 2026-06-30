'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import type { FlagType, JsonValue, TargetingRule } from '@/core/types';
import {
  BOOLEAN_ROWS,
  VariantsEditor,
  compileVariants,
  type VariantRow,
} from '../../variants-editor';
import type { SegmentRef } from '../../condition-builder';
import { TargetingBuilder, type TargetingResult } from '../../targeting-builder';
import { publish, updateFlagDefinition, updateFlagEnvironment } from '../../../../actions';

type EnvConfig = {
  id: string;
  name: string;
  key: string;
  color: string;
  configId: string | null;
  state: 'ENABLED' | 'DISABLED';
  defaultVariant: string;
  targeting: TargetingRule[];
};

function valueToRaw(type: FlagType, v: JsonValue): string {
  if (type === 'string') return typeof v === 'string' ? v : String(v);
  if (type === 'number') return String(v);
  return JSON.stringify(v);
}

function variantsToRows(type: FlagType, variants: Record<string, JsonValue>): VariantRow[] {
  if (type === 'boolean') return BOOLEAN_ROWS;
  const rows = Object.entries(variants).map(([name, value]) => ({ name, raw: valueToRaw(type, value) }));
  return rows.length ? rows : [{ name: '', raw: '' }];
}

export function FlagEditor({
  orgSlug,
  canManage,
  flag,
  variants,
  environments,
  segments,
}: {
  orgSlug: string;
  canManage: boolean;
  flag: { id: string; key: string; name: string; description: string; type: FlagType };
  variants: Record<string, JsonValue>;
  environments: EnvConfig[];
  segments: SegmentRef[];
}) {
  const variantNames = Object.keys(variants);

  return (
    <div>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{flag.name}</h1>
        <Badge variant="brand">{flag.type}</Badge>
      </div>
      <p className="mt-1 font-mono text-xs text-muted">{flag.key}</p>

      <Definition orgSlug={orgSlug} flag={flag} variants={variants} canManage={canManage} />

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Environments</h2>
        <div className="mt-3 space-y-3">
          {environments.map((env) => (
            <EnvPanel
              key={env.id}
              orgSlug={orgSlug}
              canManage={canManage}
              env={env}
              variantNames={variantNames}
              segments={segments}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function Definition({
  orgSlug,
  flag,
  variants,
  canManage,
}: {
  orgSlug: string;
  flag: { id: string; name: string; description: string; type: FlagType };
  variants: Record<string, JsonValue>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(flag.name);
  const [description, setDescription] = useState(flag.description);
  const [rows, setRows] = useState<VariantRow[]>(variantsToRows(flag.type, variants));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setMsg(null);
    const compiled = compileVariants(flag.type, rows);
    if ('error' in compiled) return setError(compiled.error);
    setBusy(true);
    const res = await updateFlagDefinition(orgSlug, flag.id, {
      name,
      description,
      variants: compiled.variants,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setMsg('Saved');
    router.refresh();
  }

  return (
    <section className="mt-8 rounded-xl border border-border bg-card p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Definition</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Description</span>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this flag control?"
            disabled={!canManage}
          />
        </label>
      </div>

      <div className="mt-4">
        <VariantsEditor type={flag.type} rows={rows} onRowsChange={setRows} />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            Save definition
          </Button>
          {msg && <span className="text-sm text-emerald-500">{msg}</span>}
        </div>
      )}
    </section>
  );
}

function EnvPanel({
  orgSlug,
  canManage,
  env,
  variantNames,
  segments,
}: {
  orgSlug: string;
  canManage: boolean;
  env: EnvConfig;
  variantNames: string[];
  segments: SegmentRef[];
}) {
  const router = useRouter();
  const [state, setState] = useState<'ENABLED' | 'DISABLED'>(env.state);
  const [defaultVariant, setDefaultVariant] = useState(env.defaultVariant);
  const [targeting, setTargeting] = useState<TargetingResult>({ ok: true, rules: env.targeting });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save() {
    setError(null);
    setNote(null);
    if (!targeting.ok) return setError(targeting.error);
    if (!env.configId) return setError('No config for this environment.');
    setBusy(true);
    const res = await updateFlagEnvironment(orgSlug, env.configId, {
      state,
      defaultVariant,
      targeting: targeting.rules,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setNote('Saved (publish to roll out)');
    router.refresh();
  }

  async function doPublish() {
    setNote('Publishing…');
    const res = await publish(orgSlug, env.id);
    setNote(res.ok ? `Published · ${res.data.flagCount} flag(s) · ${res.data.etag}` : res.error);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: env.color }} />
          <p className="font-medium">{env.name}</p>
          <Badge variant={state === 'ENABLED' ? 'success' : 'neutral'}>{state.toLowerCase()}</Badge>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={doPublish}>
            <Rocket className="size-3.5" /> Publish
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">State</span>
          <Select
            value={state}
            onValueChange={(v) => setState(v as 'ENABLED' | 'DISABLED')}
            ariaLabel="State"
            options={[
              { value: 'ENABLED', label: 'Enabled' },
              { value: 'DISABLED', label: 'Disabled' },
            ]}
            className="w-32"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Default</span>
          <Select
            value={defaultVariant}
            onValueChange={setDefaultVariant}
            ariaLabel="Default variant"
            options={variantNames.map((n) => ({ value: n, label: n }))}
            className="w-36"
          />
        </label>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Targeting rules</span>
          <span className="text-[11px] text-muted">First match wins</span>
        </div>
        <TargetingBuilder
          initialRules={env.targeting}
          variantNames={variantNames}
          segments={segments}
          onChange={setTargeting}
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy}>
            Save {env.name}
          </Button>
          {note && <span className="text-sm text-muted">{note}</span>}
        </div>
      )}
    </div>
  );
}
