'use client';

import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { FlagType, JsonValue } from '@/core/types';

export type VariantRow = { name: string; raw: string };

/** Convert editor rows → a typed variants record, or an error message. */
export function compileVariants(
  type: FlagType,
  rows: VariantRow[],
): { variants: Record<string, JsonValue> } | { error: string } {
  if (type === 'boolean') return { variants: { true: true, false: false } };
  const variants: Record<string, JsonValue> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) return { error: 'Every variant needs a name.' };
    if (name in variants) return { error: `Duplicate variant "${name}".` };
    if (type === 'string') {
      variants[name] = row.raw;
    } else if (type === 'number') {
      const n = Number(row.raw);
      if (row.raw.trim() === '' || Number.isNaN(n)) return { error: `"${name}" must be a number.` };
      variants[name] = n;
    } else {
      try {
        variants[name] = JSON.parse(row.raw) as JsonValue;
      } catch {
        return { error: `"${name}" must be valid JSON.` };
      }
    }
  }
  if (!Object.keys(variants).length) return { error: 'Add at least one variant.' };
  return { variants };
}

export const BOOLEAN_ROWS: VariantRow[] = [
  { name: 'true', raw: 'true' },
  { name: 'false', raw: 'false' },
];

/**
 * Typed variant editor. For boolean flags the variants are fixed (true/false) and
 * only the default is chosen; for string/number/object the user edits name→value
 * rows (values parsed per type). Fully controlled.
 */
export function VariantsEditor({
  type,
  rows,
  onRowsChange,
  defaultVariant,
  onDefaultChange,
}: {
  type: FlagType;
  rows: VariantRow[];
  onRowsChange: (rows: VariantRow[]) => void;
  /** Omit to hide the default-variant selector (e.g. when default is per-environment). */
  defaultVariant?: string;
  onDefaultChange?: (v: string) => void;
}) {
  const names = useMemo(
    () => (type === 'boolean' ? ['true', 'false'] : rows.map((r) => r.name.trim()).filter(Boolean)),
    [type, rows],
  );

  const valuePlaceholder =
    type === 'number' ? '42' : type === 'object' ? '{"ratio":0.5}' : 'value';

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Variants</span>

      {type === 'boolean' ? (
        <p className="text-xs text-muted">Boolean flags have fixed <code className="font-mono">true</code> / <code className="font-mono">false</code> variants.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.name}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, name: e.target.value };
                  onRowsChange(next);
                }}
                placeholder="name"
                className="h-9 w-40 font-mono"
              />
              <Input
                value={row.raw}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, raw: e.target.value };
                  onRowsChange(next);
                }}
                placeholder={valuePlaceholder}
                className="h-9 flex-1 font-mono"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Remove variant"
                onClick={() => onRowsChange(rows.filter((_, j) => j !== i))}
                disabled={rows.length <= 1}
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onRowsChange([...rows, { name: '', raw: '' }])}
          >
            <Plus className="size-3.5" /> Add variant
          </Button>
        </div>
      )}

      {onDefaultChange && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-muted">Default variant</span>
          <Select
            value={defaultVariant ?? ''}
            onValueChange={onDefaultChange}
            ariaLabel="Default variant"
            options={names.map((n) => ({ value: n, label: n }))}
            className="w-40"
          />
        </div>
      )}
    </div>
  );
}
