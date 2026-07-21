"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Textarea } from "@/components/form-controls";
import { deriveVariantKey, type FlagType } from "@/lib/flags";

/**
 * The variant table on the create-flag form.
 *
 * A flag with one value is a constant, so making people create the flag and
 * THEN go add the variants they already had in mind was busywork: the whole
 * reason to reach for a string flag is that it has more than one string.
 *
 * VALUE and LABEL are the only two things asked for, because they are the only
 * two a person has an opinion about. The stable key that rules reference is
 * generated on submit (see `deriveVariantKey`) and never shown. An earlier
 * version put that key in the table next to the value, and it read as being
 * asked the same question twice: nobody creating the value "blue" wants to
 * also invent "control" for it.
 *
 * Values are submitted RAW and coerced server-side by type, which keeps one
 * parsing implementation (src/lib/flags.ts) rather than a client-side copy
 * that could disagree with it.
 */
export type DraftVariant = { key: string; raw: string; label?: string };

type Row = { raw: string; label: string };

const seedFor = (type: FlagType): Row[] =>
  type === "string"
    ? [
        { raw: "", label: "" },
        { raw: "", label: "" },
      ]
    : [{ raw: type === "object" ? "{}" : "0", label: "" }];

export function VariantRows({ type }: { type: FlagType }) {
  const [variants, setVariants] = useState<Row[]>(() => seedFor(type));
  // A JSON variant has no short value to stand in for it, so a label would be
  // the only readable handle - but on the CREATE form nothing reads it yet:
  // there are no rules, no rollouts, no evaluation history. Asking for one
  // here is asking for a name for something that has not been used. The flag
  // page offers it once the variant can actually be referenced.
  const labelled = type !== "object";
  const columns = labelled
    ? "grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,11rem)_2.25rem]"
    : "grid-cols-[2.25rem_minmax(0,1fr)_2.25rem]";
  // By POSITION, not by key. Nothing here has a key until submit, and values
  // are edited freely, so a position is the only thing that stays true.
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const groupName = useId();

  const update = (index: number, patch: Partial<Row>) =>
    setVariants((rows) =>
      rows.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    );

  const remove = (index: number) => {
    setVariants((rows) => rows.filter((_, position) => position !== index));
    // Keep pointing at the same ROW. Removing something above it shifts it up;
    // removing the row itself falls to the first survivor, because a flag
    // whose fallback does not exist has no defined outcome.
    setFallbackIndex((current) =>
      index === current ? 0 : index < current ? current - 1 : current,
    );
  };

  const add = () =>
    setVariants((rows) => [
      ...rows,
      { raw: type === "object" ? "{}" : "", label: "" },
    ]);

  // Keys are minted here, at the last possible moment, so that editing a value
  // before submitting simply produces a different key rather than leaving a
  // stale one behind. `label || raw` is the source so a labelled variant reads
  // as its label ("Dark blue" -> dark-blue) rather than as "#0f766e".
  const keys: string[] = [];
  for (const row of variants) {
    keys.push(deriveVariantKey(row.label || row.raw, keys));
  }
  const payload: DraftVariant[] = variants.map((row, index) => ({
    key: keys[index],
    raw: row.raw,
    ...(row.label.trim() ? { label: row.label.trim() } : {}),
  }));

  const duplicateValue = new Set(
    variants
      .map((row) => row.raw)
      .filter((raw, index, all) => raw && all.indexOf(raw) !== index),
  );

  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-medium text-zinc-400">Variants</span>

      <input type="hidden" name="variants" value={JSON.stringify(payload)} />
      <input
        type="hidden"
        name="default_variant"
        value={keys[fallbackIndex] ?? ""}
      />

      <div className="border border-white/10 bg-black/20">
        <div
          className={`grid ${columns} items-center gap-2 border-b border-white/10 bg-white/2 px-2.5 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600`}
        >
          <span className="text-center" title="Served when no rule matches">
            Def
          </span>
          <span>Value</span>
          {labelled ? <span>Label (optional)</span> : null}
          <span />
        </div>

        {variants.map((variant, index) => (
          <div
            key={index}
            className={`grid ${columns} items-start gap-2 border-b border-white/5 px-2.5 py-2 last:border-b-0`}
          >
            <div className="flex h-8 items-center justify-center">
              <input
                type="radio"
                name={groupName}
                aria-label={`Serve variant ${index + 1} by default`}
                checked={fallbackIndex === index}
                onChange={() => setFallbackIndex(index)}
                className="accent-teal-500"
              />
            </div>

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
                type={
                  type === "integer" || type === "float" ? "number" : "text"
                }
                step={
                  type === "integer"
                    ? "1"
                    : type === "float"
                      ? "any"
                      : undefined
                }
                value={variant.raw}
                placeholder={type === "string" ? "blue" : "0"}
                onChange={(event) => update(index, { raw: event.target.value })}
                className={
                  duplicateValue.has(variant.raw) ? "border-amber-500/40" : ""
                }
              />
            )}

            {labelled ? (
              <Input
                compact
                aria-label={`Variant ${index + 1} label`}
                value={variant.label}
                placeholder="Label"
                maxLength={60}
                onChange={(event) =>
                  update(index, { label: event.target.value })
                }
              />
            ) : null}

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
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-600">
          {duplicateValue.size
            ? "Two variants share a value, so rules cannot tell them apart."
            : "The selected variant is served when no targeting rule matches."}
        </span>
        <Button variant="secondary" size="sm" onClick={add} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add variant
        </Button>
      </div>
    </div>
  );
}
