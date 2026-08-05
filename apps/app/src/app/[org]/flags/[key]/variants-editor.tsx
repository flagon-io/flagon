"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input, useConfirm } from "@flagon/design";
import {
  createVariantAction,
  deleteVariantAction,
  updateVariantAction,
} from "../actions";
import type { FlagVariant } from "@/lib/flags-api";
import { variantLabel } from "@/lib/variant-label";
import { JsonEditor } from "../json-editor";

/** The value editors only run for multivariate flags; booleans have fixed on/off. */
type MultiType = "string" | "number" | "json";

const DOT_COLORS = [
  "bg-teal-400",
  "bg-sky-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
  "bg-emerald-400",
];

function formatValue(type: MultiType, value: unknown): string {
  if (type === "json")
    return JSON.stringify(
      value ?? {},
      null,
      value && typeof value === "object" && Object.keys(value).length ? 2 : 0,
    );
  return value === null || value === undefined ? "" : String(value);
}

/** Parse an edited value back into the flag's type, or return an error string. */
function parseValue(type: MultiType, text: string): { value: unknown } | { error: string } {
  if (type === "number") {
    if (text.trim() === "") return { error: "Enter a number." };
    const n = Number(text);
    if (Number.isNaN(n)) return { error: "Not a valid number." };
    return { value: n };
  }
  if (type === "json") {
    try {
      return { value: JSON.parse(text) };
    } catch {
      return { error: "Not valid JSON." };
    }
  }
  return { value: text };
}

function defaultValue(type: MultiType): unknown {
  return type === "number" ? 0 : type === "json" ? {} : "";
}

function FieldLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`mb-1 block text-[11px] font-medium tracking-wide text-zinc-600 uppercase ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Editable variants for a multivariate flag: change a value or label in place,
 * add a variant, or remove one. Each write goes straight to the API (which
 * type-checks the value and refuses to delete a variant still referenced by a
 * default, off value, or targeting rule) and the page refreshes. JSON variants
 * get a stacked layout with a highlighted editor; string/number are inline.
 */
export function VariantsEditor({
  slug,
  flagKey,
  type,
  variants,
  canManage,
  readOnly = false,
}: {
  slug: string;
  flagKey: string;
  type: MultiType;
  variants: FlagVariant[];
  canManage: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const editable = canManage && !readOnly;

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  async function confirmDelete(variant: FlagVariant, displayName: string) {
    const ok = await confirm({
      title: "Delete variant?",
      message: (
        <>
          Delete <strong className="text-zinc-200">{displayName}</strong>? This
          can&apos;t be undone.
        </>
      ),
      confirmLabel: "Delete variant",
      tone: "danger",
    });
    if (!ok) return;
    run(() => deleteVariantAction(slug, flagKey, variant.key));
  }

  return (
    <section>
      <h2 className="text-sm font-medium text-zinc-300">Variants</h2>
      <p className="mb-2 text-xs text-zinc-500">The values this flag can evaluate to.</p>
      <div className="overflow-hidden rounded-xl border border-white/10">
        {variants.map((v, i) => (
          <VariantRow
            // Re-baseline the row's drafts whenever the server value/label changes.
            key={`${v.id}:${formatValue(type, v.value)}:${v.label ?? ""}`}
            slug={slug}
            flagKey={flagKey}
            type={type}
            variant={v}
            index={i}
            editable={editable}
            canDelete={editable && variants.length > 1}
            pending={pending}
            onRun={run}
            onDelete={confirmDelete}
          />
        ))}

        <div className="flex items-center justify-between gap-3 border-t border-white/8 px-4 py-2.5">
          <span className="text-xs text-zinc-500">
            {variants.length} variant{variants.length === 1 ? "" : "s"}
          </span>
          {editable ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => createVariantAction(slug, flagKey, { value: defaultValue(type) }))}
            >
              <Plus className="size-3.5" /> Add variant
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : null}
      {confirmDialog}
    </section>
  );
}

function VariantRow({
  slug,
  flagKey,
  type,
  variant,
  index,
  editable,
  canDelete,
  pending,
  onRun,
  onDelete,
}: {
  slug: string;
  flagKey: string;
  type: MultiType;
  variant: FlagVariant;
  index: number;
  editable: boolean;
  canDelete: boolean;
  pending: boolean;
  onRun: (fn: () => Promise<{ error?: string }>) => void;
  onDelete: (variant: FlagVariant, displayName: string) => void;
}) {
  const [valueText, setValueText] = useState(() => formatValue(type, variant.value));
  const [label, setLabel] = useState(variant.label ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const dot = DOT_COLORS[index % DOT_COLORS.length];
  // What the variant is called when the label is blank (e.g. "Variant 1").
  const fallbackName = variantLabel({ key: variant.key, label: null, value: variant.value }, index);

  function commitValue() {
    if (valueText === formatValue(type, variant.value)) return;
    const parsed = parseValue(type, valueText);
    if ("error" in parsed) return setLocalError(parsed.error);
    setLocalError(null);
    onRun(() => updateVariantAction(slug, flagKey, variant.key, { value: parsed.value }));
  }

  function commitLabel() {
    const next = label.trim();
    if (next === (variant.label ?? "")) return;
    onRun(() => updateVariantAction(slug, flagKey, variant.key, { label: next || null }));
  }

  const indexDot = (
    <div className="flex shrink-0 items-center gap-2.5 pt-6">
      <span className="w-6 text-right font-mono text-xs text-zinc-600">#{index + 1}</span>
      <span className={`size-2.5 rounded-full ${dot}`} />
    </div>
  );

  const trash = canDelete ? (
    <button
      type="button"
      onClick={() => onDelete(variant, variant.label || fallbackName)}
      disabled={pending}
      title="Remove variant"
      aria-label={`Delete ${variant.label || fallbackName}`}
      className="mt-6 grid size-8 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-red-400 disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  ) : (
    <span className="w-8 shrink-0" />
  );

  const labelField = (
    <div className="min-w-0">
      <FieldLabel>Label (optional)</FieldLabel>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={commitLabel}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        disabled={!editable || pending}
        placeholder={fallbackName}
        aria-label={`${variant.key} label`}
      />
    </div>
  );

  const border = index > 0 ? "border-t border-white/8" : "";

  // JSON: label on top, then the highlighted editor full-width below.
  if (type === "json") {
    return (
      <div className={`flex items-start gap-3 px-4 py-3 ${border}`}>
        {indexDot}
        <div className="min-w-0 flex-1">
          <div className="max-w-xs">{labelField}</div>
          <div className="mt-3">
            <FieldLabel>Value</FieldLabel>
            <JsonEditor
              value={valueText}
              onChange={setValueText}
              onBlur={commitValue}
              disabled={!editable || pending}
              invalid={Boolean(localError)}
              ariaLabel={`${variant.key} value`}
            />
            {localError ? <p className="mt-1 text-xs text-red-400">{localError}</p> : null}
          </div>
        </div>
        {trash}
      </div>
    );
  }

  // String / number: value and label side by side.
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${border}`}>
      {indexDot}
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <FieldLabel>Value</FieldLabel>
          <Input
            type={type === "number" ? "number" : "text"}
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            onBlur={commitValue}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            disabled={!editable || pending}
            className="font-mono"
            aria-label={`${variant.key} value`}
          />
          {localError ? <p className="mt-1 text-xs text-red-400">{localError}</p> : null}
        </div>
        {labelField}
      </div>
      {trash}
    </div>
  );
}
