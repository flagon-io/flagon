'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal } from '@/components/ui/modal';
import type { Condition } from '@/core/types';
import { createSegment, deleteSegment, updateSegment } from '../../actions';
import {
  buildCondition,
  ConditionBuilder,
  EMPTY_CLAUSE,
  parseCondition,
  type Parsed,
  type SegmentRef,
} from './condition-builder';

type Segment = { id: string; key: string; name: string; description: string | null; condition: Condition };

function keyify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
}

export function SegmentsSection({
  orgSlug,
  projectId,
  canManage,
  segments,
}: {
  orgSlug: string;
  projectId: string;
  canManage: boolean;
  segments: Segment[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const refs: SegmentRef[] = segments.map((s) => ({ key: s.key, name: s.name }));

  async function remove(id: string) {
    await deleteSegment(orgSlug, id);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Segments</h2>
          <p className="mt-0.5 text-xs text-muted">
            Reusable audience definitions you can reference from any flag&rsquo;s targeting.
          </p>
        </div>
        {canManage && (
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" /> New segment
          </Button>
        )}
      </div>

      {segments.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted">
          No segments yet.
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <ul>
            {segments.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="truncate font-mono text-xs text-muted">
                    {s.key}
                    {s.description ? ` · ${s.description}` : ''}
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" aria-label="Edit segment" onClick={() => setEditing(s)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete segment" onClick={() => remove(s.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New segment' : 'Edit segment'}
        description="Define who's in this segment, then reference it from flag targeting."
        size="xl"
      >
        {editing && (
          <SegmentForm
            key={editing === 'new' ? 'new' : editing.id}
            orgSlug={orgSlug}
            projectId={projectId}
            segment={editing === 'new' ? null : editing}
            refs={refs}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

function SegmentForm({
  orgSlug,
  projectId,
  segment,
  refs,
  onClose,
  onSaved,
}: {
  orgSlug: string;
  projectId: string;
  segment: Segment | null;
  refs: SegmentRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(segment?.name ?? '');
  const [key, setKey] = useState(segment?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(Boolean(segment));
  const [description, setDescription] = useState(segment?.description ?? '');
  const [cond, setCond] = useState<Parsed>(() =>
    segment
      ? parseCondition(segment.condition)
      : { advanced: false, combinator: 'all', clauses: [{ ...EMPTY_CLAUSE }] },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = keyTouched ? key : keyify(name);
  // Don't let a segment reference itself.
  const otherRefs = refs.filter((r) => r.key !== segment?.key);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let condition: Condition;
    if (cond.advanced) {
      try {
        condition = JSON.parse(cond.json);
      } catch {
        return setError('Condition JSON is invalid.');
      }
    } else {
      condition = buildCondition(cond.combinator, cond.clauses);
    }
    setBusy(true);
    const res = segment
      ? await updateSegment(orgSlug, segment.id, { name, description, condition })
      : await createSegment(orgSlug, projectId, { name, key: effectiveKey, description, condition });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    onSaved();
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Enterprise customers" required />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Key</span>
          <Input
            value={effectiveKey}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(keyify(e.target.value));
            }}
            placeholder="enterprise-customers"
            className="font-mono"
            disabled={Boolean(segment)}
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          Description <span className="text-muted">(optional)</span>
        </span>
        <Textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Who belongs to this segment?"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-sm font-medium">Membership</span>
        <ConditionBuilder
          state={cond}
          onChange={setCond}
          segments={otherRefs}
          emptyLabel="Empty segment. Add a clause to define who's in it."
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim()}>
          {segment ? 'Save segment' : 'Create segment'}
        </Button>
      </div>
    </form>
  );
}
