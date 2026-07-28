import type { FlagType, JsonValue } from "./types.js";

/**
 * The variants a flag is born with, derived from its type — pure, so the rule is
 * one obvious testable function.
 *
 *   - boolean: exactly two, on=true / off=false. Default serves on, off serves
 *     off. There is no variant editor for booleans (matches the create UI).
 *   - string/number/json: the variants the user entered, keyed variant-1..N
 *     (stable identifiers rules/rollouts reference; the value is the payload,
 *     the label is display). The first is both the default and the off value
 *     until the creator configures otherwise.
 */
export type VariantSeed = {
  key: string;
  value: JsonValue;
  label: string | null;
  sortOrder: number;
};

export type VariantPlan = {
  variants: VariantSeed[];
  defaultKey: string;
  offKey: string;
};

export function planVariants(
  type: FlagType,
  requested: { value: JsonValue; label?: string | null }[],
): VariantPlan {
  if (type === "boolean") {
    return {
      variants: [
        { key: "on", value: true, label: "On", sortOrder: 0 },
        { key: "off", value: false, label: "Off", sortOrder: 1 },
      ],
      defaultKey: "on",
      offKey: "off",
    };
  }

  const variants: VariantSeed[] = requested.map((v, i) => ({
    key: `variant-${i + 1}`,
    value: v.value,
    label: v.label ?? null,
    sortOrder: i,
  }));
  const firstKey = variants[0]?.key ?? "";
  return { variants, defaultKey: firstKey, offKey: firstKey };
}
