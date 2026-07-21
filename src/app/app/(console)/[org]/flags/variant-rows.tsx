"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Textarea } from "@/components/form-controls";
import { FLAG_KEY_PATTERN, suggestFlagKey, type FlagType } from "@/lib/flags";

/**
 * The variant table on the create-flag form.
 *
 * A flag with one value is a constant, so making people create the flag and
 * THEN go add the variants they already had in mind was busywork: the whole
 * reason to reach for a string flag is that it has more than one string. This
 * is the same key/value/fallback model the definition editor uses, so nothing
 * has to be relearned on the flag page afterwards.
 *
 * Values are submitted RAW and coerced server-side by type, which keeps one
 * parsing implementation (src/lib/flags.ts) rather than a client-side copy
 * that could disagree with it.
 */
export type DraftVariant = { key: string; raw: string };

const seedFor = (type: FlagType): DraftVariant[] =>
  type === "object"
    ? [{ key: "default", raw: "{}" }]
    : type === "string"
      ? [{ key: "control", raw: "" }, { key: "treatment", raw: "" }]
      : [{ key: "default", raw: "0" }];

export function VariantRows({ type }: { type: FlagType }) {
  const [variants, setVariants] = useState<DraftVariant[]>(() => seedFor(type));
  const [fallback, setFallback] = useState(() => seedFor(type)[0].key);
  const groupName = useId();

  const update = (index: number, patch: Partial<DraftVariant>) =>
    setVariants((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );

  const remove = (index: number) =>
    setVariants((rows) => {
      const next = rows.filter((_, position) => position !== index);
      // The fallback must always point at a variant that exists, or the flag
      // has no defined outcome. Falling back to the first survivor is the
      // least surprising repair.
      if (rows[index].key === fallback && next.length) setFallback(next[0].key);
      return next;
    });

  const add = () =>
    setVariants((rows) => [
      ...rows,
      { key: uniqueKey(rows, "variant"), raw: type === "object" ? "{}" : "" },
    ]);

  const duplicate = new Set(
    variants
      .map((row) => row.key)
      .filter((key, index, all) => key && all.indexOf(key) !== index),
  );

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-zinc-400">Variants</span>

      <input type="hidden" name="variants" value={JSON.stringify(variants)} />
      <input type="hidden" name="default_variant" value={fallback} />

      <div className="border border-white/10 bg-black/20">
        <div className="grid grid-cols-[2.25rem_minmax(0,11rem)_minmax(0,1fr)_2.25rem] items-center gap-2 border-b border-white/10 bg-white/[0.02] px-2.5 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
          <span className="text-center" title="Served when no rule matches">
            Def
          </span>
          <span>Key</span>
          <span>Value</span>
          <span />
        </div>

        {variants.map((variant, index) => {
          const invalid = variant.key !== "" && !FLAG_KEY_PATTERN.test(variant.key);
          return (
            <div
              key={index}
              className="grid grid-cols-[2.25rem_minmax(0,11rem)_minmax(0,1fr)_2.25rem] items-start gap-2 border-b border-white/5 px-2.5 py-2 last:border-b-0"
            >
              <div className="flex h-8 items-center justify-center">
                <input
                  type="radio"
                  name={groupName}
                  aria-label={`Serve ${variant.key || "this variant"} by default`}
                  checked={fallback === variant.key}
                  onChange={() => setFallback(variant.key)}
                  className="accent-teal-500"
                />
              </div>

              <Input
                compact
                aria-label={`Variant ${index + 1} key`}
                value={variant.key}
                placeholder="control"
                onChange={(event) => {
                  const next = suggestFlagKey(event.target.value);
                  // Keep the fallback pointed at this row while it is renamed,
                  // instead of silently orphaning it mid-keystroke.
                  if (fallback === variant.key) setFallback(next);
                  update(index, { key: next });
                }}
                className={
                  invalid || duplicate.has(variant.key)
                    ? "border-red-500/50 font-mono"
                    : "font-mono"
                }
              />

              {type === "object" ? (
                <Textarea
                  aria-label={`Variant ${index + 1} value`}
                  value={variant.raw}
                  onChange={(event) => update(index, { raw: event.target.value })}
                  className="min-h-16 font-mono text-xs"
                />
              ) : (
                <Input
                  compact
                  aria-label={`Variant ${index + 1} value`}
                  type={type === "integer" || type === "float" ? "number" : "text"}
                  step={type === "integer" ? "1" : type === "float" ? "any" : undefined}
                  value={variant.raw}
                  placeholder={type === "string" ? "blue" : "0"}
                  onChange={(event) => update(index, { raw: event.target.value })}
                />
              )}

              <div className="flex h-8 items-center justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove variant ${index + 1}`}
                  // One variant is the floor: a flag with none cannot resolve.
                  disabled={variants.length < 2}
                  onClick={() => remove(index)}
                  className="px-1.5 text-zinc-600 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-600">
          {duplicate.size
            ? "Variant keys must be unique."
            : "The selected variant is served when no targeting rule matches."}
        </span>
        <Button variant="secondary" size="sm" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add variant
        </Button>
      </div>
    </div>
  );
}

/** `variant`, `variant-2`, `variant-3`... so a new row is never a duplicate. */
function uniqueKey(rows: DraftVariant[], base: string): string {
  const taken = new Set(rows.map((row) => row.key));
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
