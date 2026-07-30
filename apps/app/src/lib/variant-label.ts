import type { FlagVariant } from "./flags-api";

/**
 * The human name to show for a variant, Vercel-style:
 *   1. its label, if set;
 *   2. otherwise the value itself for primitives (e.g. "blue", "42") — which
 *      reads naturally for string/number flags;
 *   3. otherwise a positional name like "Variant 1" — so a JSON/object variant
 *      never renders as "[object Object]".
 */
export function variantLabel(
  v: Pick<FlagVariant, "key" | "label" | "value">,
  index?: number,
): string {
  const label = v.label?.trim();
  if (label) return label;

  const val = v.value;
  if (typeof val === "string" && val.trim() !== "") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);

  // Object / array / empty: fall back to a positional name. Prefer the variant
  // key's number ("variant-3" -> "Variant 3") so it stays stable across reorders.
  const m = /^variant-(\d+)$/.exec(v.key);
  if (m) return `Variant ${m[1]}`;
  return `Variant ${(index ?? 0) + 1}`;
}
