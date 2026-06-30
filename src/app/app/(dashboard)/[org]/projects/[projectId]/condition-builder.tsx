'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';
import type { Condition, JsonValue } from '@/core/types';

export type SegmentRef = { key: string; name: string };

/** A single leaf clause as edited in the UI (raw strings; parsed on serialize). */
export type Clause = {
  op: string;
  attr: string;
  raw: string;
  cmp?: string;
  ref?: string;
};

const OPERATORS: { value: string; label: string; input: 'text' | 'number' | 'list' | 'semver' | 'segment' }[] = [
  { value: 'eq', label: 'equals', input: 'text' },
  { value: 'ne', label: 'does not equal', input: 'text' },
  { value: 'in', label: 'is one of', input: 'list' },
  { value: 'nin', label: 'is not one of', input: 'list' },
  { value: 'contains', label: 'contains', input: 'text' },
  { value: 'starts_with', label: 'starts with', input: 'text' },
  { value: 'ends_with', label: 'ends with', input: 'text' },
  { value: 'gt', label: 'greater than', input: 'number' },
  { value: 'gte', label: 'greater or equal', input: 'number' },
  { value: 'lt', label: 'less than', input: 'number' },
  { value: 'lte', label: 'less or equal', input: 'number' },
  { value: 'semver', label: 'semver', input: 'semver' },
  { value: 'segment', label: 'in segment', input: 'segment' },
];

const SEMVER_CMP = ['=', '>', '>=', '<', '<='];

function inputKind(op: string) {
  return OPERATORS.find((o) => o.value === op)?.input ?? 'text';
}

/** Parse a raw token into the most specific JSON scalar (number/bool/string). */
function parseScalar(raw: string): JsonValue {
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  return raw;
}

function clauseToCondition(c: Clause): Condition | null {
  if (c.op === 'segment') return c.ref ? { op: 'segment', ref: c.ref } : null;
  if (!c.attr.trim()) return null;
  const attr = c.attr.trim();
  switch (c.op) {
    case 'eq':
    case 'ne':
      return { op: c.op as 'eq' | 'ne', attr, value: parseScalar(c.raw) };
    case 'contains':
    case 'starts_with':
    case 'ends_with':
      return { op: c.op as 'contains' | 'starts_with' | 'ends_with', attr, value: c.raw };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const n = Number(c.raw);
      if (c.raw.trim() === '' || Number.isNaN(n)) return null;
      return { op: c.op as 'gt' | 'gte' | 'lt' | 'lte', attr, value: n };
    }
    case 'in':
    case 'nin':
      return {
        op: c.op as 'in' | 'nin',
        attr,
        values: c.raw
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .map(parseScalar),
      };
    case 'semver':
      return { op: 'semver', attr, cmp: (c.cmp ?? '=') as '=' | '>' | '>=' | '<' | '<=', value: c.raw };
    default:
      return null;
  }
}

function conditionToClause(cond: Condition): Clause | null {
  switch (cond.op) {
    case 'eq':
    case 'ne':
      return { op: cond.op, attr: cond.attr, raw: String(cond.value ?? '') };
    case 'contains':
    case 'starts_with':
    case 'ends_with':
      return { op: cond.op, attr: cond.attr, raw: cond.value };
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return { op: cond.op, attr: cond.attr, raw: String(cond.value) };
    case 'in':
    case 'nin':
      return { op: cond.op, attr: cond.attr, raw: cond.values.map(String).join(', ') };
    case 'semver':
      return { op: 'semver', attr: cond.attr, raw: cond.value, cmp: cond.cmp };
    case 'segment':
      return { op: 'segment', attr: '', raw: '', ref: cond.ref };
    default:
      return null; // true / all / any / not at leaf position — not representable
  }
}

export type Parsed =
  | { advanced: false; combinator: 'all' | 'any'; clauses: Clause[] }
  | { advanced: true; json: string };

/** Condition (engine shape) → editable builder state, or an advanced JSON fallback. */
export function parseCondition(cond: Condition | undefined): Parsed {
  if (!cond || cond.op === 'true') return { advanced: false, combinator: 'all', clauses: [] };
  if (cond.op === 'all' || cond.op === 'any') {
    const clauses = cond.of.map(conditionToClause);
    if (clauses.some((c) => c === null)) return { advanced: true, json: JSON.stringify(cond, null, 2) };
    return { advanced: false, combinator: cond.op, clauses: clauses as Clause[] };
  }
  const leaf = conditionToClause(cond);
  if (leaf) return { advanced: false, combinator: 'all', clauses: [leaf] };
  return { advanced: true, json: JSON.stringify(cond, null, 2) };
}

/** Builder state → Condition (engine shape). */
export function buildCondition(combinator: 'all' | 'any', clauses: Clause[]): Condition {
  const conds = clauses.map(clauseToCondition).filter((c): c is Condition => c !== null);
  if (conds.length === 0) return { op: 'true' };
  if (conds.length === 1) return conds[0]!;
  return { op: combinator, of: conds };
}

export const EMPTY_CLAUSE: Clause = { op: 'eq', attr: '', raw: '' };

/**
 * Visual editor for a boolean condition: a combinator (match ALL / ANY) over a
 * list of attribute/segment clauses. Conditions it can't represent (nested
 * groups, `not`) fall back to a validated JSON editor so no data is lost.
 *
 * Fully controlled: `state` is the parsed builder state, `onChange` receives the
 * next state. The parent owns persistence (serialize with buildCondition).
 */
export function ConditionBuilder({
  state,
  onChange,
  segments,
  emptyLabel = 'Always matches. Add a clause to narrow it.',
}: {
  state: Parsed;
  onChange: (next: Parsed) => void;
  segments: SegmentRef[];
  emptyLabel?: string;
}) {
  if (state.advanced) {
    return (
      <div>
        <p className="mb-1.5 text-xs text-muted">
          Advanced condition (nested groups / not). Edit as JSON.
        </p>
        <Textarea
          rows={6}
          spellCheck={false}
          className="font-mono text-xs"
          defaultValue={state.json}
          onChange={(e) => onChange({ advanced: true, json: e.target.value })}
        />
      </div>
    );
  }

  const { combinator, clauses } = state;
  const set = (next: Partial<{ combinator: 'all' | 'any'; clauses: Clause[] }>) =>
    onChange({ advanced: false, combinator, clauses, ...next });

  const updateClause = (i: number, patch: Partial<Clause>) =>
    set({ clauses: clauses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <div>
      {clauses.length > 1 && (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted">
          <span>Match</span>
          <Select
            value={combinator}
            onValueChange={(v) => set({ combinator: v as 'all' | 'any' })}
            ariaLabel="Combinator"
            options={[
              { value: 'all', label: 'ALL' },
              { value: 'any', label: 'ANY' },
            ]}
            className="w-24"
          />
          <span>of the following</span>
        </div>
      )}

      {clauses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">
          {emptyLabel}
        </p>
      ) : (
        <div className="space-y-2">
          {clauses.map((c, i) => (
            <ClauseRow
              key={i}
              clause={c}
              segments={segments}
              onChange={(patch) => updateClause(i, patch)}
              onRemove={() => set({ clauses: clauses.filter((_, j) => j !== i) })}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="mt-2"
        onClick={() => set({ clauses: [...clauses, { ...EMPTY_CLAUSE }] })}
      >
        <Plus className="size-3.5" /> Add clause
      </Button>
    </div>
  );
}

function ClauseRow({
  clause,
  segments,
  onChange,
  onRemove,
}: {
  clause: Clause;
  segments: SegmentRef[];
  onChange: (patch: Partial<Clause>) => void;
  onRemove: () => void;
}) {
  const kind = inputKind(clause.op);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card-muted/40 p-2">
      {clause.op !== 'segment' && (
        <Input
          value={clause.attr}
          onChange={(e) => onChange({ attr: e.target.value })}
          placeholder="attribute"
          className="h-9 w-36 font-mono"
          aria-label="Attribute"
        />
      )}
      <Select
        value={clause.op}
        onValueChange={(v) => onChange({ op: v })}
        ariaLabel="Operator"
        options={OPERATORS.map((o) => ({ value: o.value, label: o.label }))}
        className="w-44"
      />

      {kind === 'segment' ? (
        <Select
          value={clause.ref ?? ''}
          onValueChange={(v) => onChange({ ref: v })}
          ariaLabel="Segment"
          options={
            segments.length
              ? segments.map((s) => ({ value: s.key, label: s.name }))
              : [{ value: '', label: 'No segments yet' }]
          }
          className="min-w-40 flex-1"
        />
      ) : kind === 'semver' ? (
        <>
          <Select
            value={clause.cmp ?? '='}
            onValueChange={(v) => onChange({ cmp: v })}
            ariaLabel="Comparator"
            options={SEMVER_CMP.map((c) => ({ value: c, label: c }))}
            className="w-20"
          />
          <Input
            value={clause.raw}
            onChange={(e) => onChange({ raw: e.target.value })}
            placeholder="1.2.0"
            className="h-9 min-w-32 flex-1 font-mono"
            aria-label="Version"
          />
        </>
      ) : (
        <Input
          value={clause.raw}
          onChange={(e) => onChange({ raw: e.target.value })}
          placeholder={kind === 'list' ? 'a, b, c' : kind === 'number' ? '42' : 'value'}
          inputMode={kind === 'number' ? 'decimal' : undefined}
          className={cn('h-9 min-w-32 flex-1 font-mono')}
          aria-label="Value"
        />
      )}

      <Button type="button" size="icon" variant="ghost" aria-label="Remove clause" onClick={onRemove}>
        <X className="size-4" />
      </Button>
    </div>
  );
}
