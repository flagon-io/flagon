'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Outcome, TargetingRule } from '@/core/types';
import {
  buildCondition,
  ConditionBuilder,
  EMPTY_CLAUSE,
  parseCondition,
  type Parsed,
  type SegmentRef,
} from './condition-builder';

export type TargetingResult = { ok: true; rules: TargetingRule[] } | { ok: false; error: string };

type Draft = { id: string; cond: Parsed; then: Outcome };

function serialize(drafts: Draft[]): TargetingResult {
  const rules: TargetingRule[] = [];
  for (const d of drafts) {
    if (d.cond.advanced) {
      try {
        rules.push({ when: JSON.parse(d.cond.json), then: d.then });
      } catch {
        return { ok: false, error: 'A rule has invalid JSON. Fix it before saving.' };
      }
    } else {
      rules.push({ when: buildCondition(d.cond.combinator, d.cond.clauses), then: d.then });
    }
  }
  return { ok: true, rules };
}

let counter = 0;
const nextId = () => `r${counter++}`;

/**
 * Visual targeting editor: an ordered list of rules (first match wins). Each rule
 * pairs a condition (ConditionBuilder) with an outcome — serve a single variant
 * or split traffic across variants. Uncontrolled draft; bubbles serialized rules
 * (or a validation error) via onChange. Initialized once from `initialRules`.
 */
export function TargetingBuilder({
  initialRules,
  variantNames,
  segments,
  onChange,
}: {
  initialRules: TargetingRule[];
  variantNames: string[];
  segments: SegmentRef[];
  onChange: (result: TargetingResult) => void;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    initialRules.map((r) => ({ id: nextId(), cond: parseCondition(r.when), then: r.then })),
  );

  function commit(next: Draft[]) {
    setDrafts(next);
    onChange(serialize(next));
  }

  const fallbackVariant = variantNames[0] ?? '';

  function addRule() {
    commit([
      ...drafts,
      { id: nextId(), cond: { advanced: false, combinator: 'all', clauses: [{ ...EMPTY_CLAUSE }] }, then: { variant: fallbackVariant } },
    ]);
  }

  function update(i: number, patch: Partial<Draft>) {
    commit(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= drafts.length) return;
    const next = [...drafts];
    [next[i], next[j]] = [next[j]!, next[i]!];
    commit(next);
  }

  return (
    <div className="space-y-3">
      {drafts.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted">
          No rules. The environment&rsquo;s default variant is served to everyone. Add a rule to target
          a subset.
        </p>
      )}

      {drafts.map((d, i) => (
        <div key={d.id} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              {i === 0 ? 'If' : 'Else if'}
            </span>
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-3.5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === drafts.length - 1}>
                <ArrowDown className="size-3.5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" aria-label="Delete rule" onClick={() => commit(drafts.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          <ConditionBuilder
            state={d.cond}
            segments={segments}
            onChange={(cond) => update(i, { cond })}
          />

          <div className="mt-3 border-t border-border pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Serve</span>
            <div className="mt-2">
              <OutcomeEditor
                outcome={d.then}
                variantNames={variantNames}
                onChange={(then) => update(i, { then })}
              />
            </div>
          </div>
        </div>
      ))}

      <Button type="button" size="sm" variant="secondary" onClick={addRule}>
        <Plus className="size-3.5" /> Add rule
      </Button>
    </div>
  );
}

function OutcomeEditor({
  outcome,
  variantNames,
  onChange,
}: {
  outcome: Outcome;
  variantNames: string[];
  onChange: (o: Outcome) => void;
}) {
  const isFractional = 'fractional' in outcome;

  function setMode(mode: 'variant' | 'rollout') {
    if (mode === 'variant' && isFractional) {
      onChange({ variant: variantNames[0] ?? '' });
    } else if (mode === 'rollout' && !isFractional) {
      onChange({
        fractional: variantNames.slice(0, 2).map((v, i) => ({ variant: v, weight: i === 0 ? 50 : 50 })),
      });
    }
  }

  return (
    <div className="space-y-2">
      <Select
        value={isFractional ? 'rollout' : 'variant'}
        onValueChange={(v) => setMode(v as 'variant' | 'rollout')}
        ariaLabel="Outcome type"
        options={[
          { value: 'variant', label: 'A single variant' },
          { value: 'rollout', label: 'A percentage rollout' },
        ]}
        className="w-52"
      />

      {!isFractional ? (
        <Select
          value={(outcome as { variant: string }).variant}
          onValueChange={(v) => onChange({ variant: v })}
          ariaLabel="Variant"
          options={variantNames.map((v) => ({ value: v, label: v }))}
          className="w-44"
        />
      ) : (
        <FractionalEditor outcome={outcome as Extract<Outcome, { fractional: unknown[] }>} variantNames={variantNames} onChange={onChange} />
      )}
    </div>
  );
}

function FractionalEditor({
  outcome,
  variantNames,
  onChange,
}: {
  outcome: Extract<Outcome, { fractional: { variant: string; weight: number }[] }>;
  variantNames: string[];
  onChange: (o: Outcome) => void;
}) {
  const rows = outcome.fractional;
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0) || 1;

  const setRows = (next: { variant: string; weight: number }[]) =>
    onChange({ fractional: next, ...(outcome.bucketBy ? { bucketBy: outcome.bucketBy } : {}) });

  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Select
            value={r.variant}
            onValueChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, variant: v } : x)))}
            ariaLabel="Variant"
            options={variantNames.map((v) => ({ value: v, label: v }))}
            className="w-40"
          />
          <Input
            type="number"
            min={0}
            value={String(r.weight)}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) || 0 } : x)))
            }
            className="h-9 w-24"
            aria-label="Weight"
          />
          <span className="w-12 text-right text-xs text-muted">
            {Math.round(((Number(r.weight) || 0) / total) * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Remove split"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            disabled={rows.length <= 1}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setRows([...rows, { variant: variantNames[0] ?? '', weight: 0 }])}
        >
          <Plus className="size-3.5" /> Add split
        </Button>
        <label className="flex items-center gap-2 text-xs text-muted">
          Bucket by
          <Input
            value={outcome.bucketBy ?? ''}
            onChange={(e) =>
              onChange({ fractional: rows, ...(e.target.value ? { bucketBy: e.target.value } : {}) })
            }
            placeholder="targetingKey"
            className="h-8 w-36 font-mono"
            aria-label="Bucket by attribute"
          />
        </label>
      </div>
    </div>
  );
}
