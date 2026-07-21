export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9._-]{0,127}$/;
export const FLAG_TYPES = [
  "boolean",
  "string",
  "integer",
  "float",
  "object",
] as const;
export const OPERATORS = [
  "equals",
  "not_equals",
  "in",
  "not_in",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "greater_than_or_equal",
  "less_than",
  "less_than_or_equal",
  "exists",
  "not_exists",
] as const;
export type FlagType = (typeof FLAG_TYPES)[number];
export type FlagValue =
  boolean | string | number | Record<string, unknown> | unknown[];
/**
 * One possible outcome of a flag.
 *
 * `value` is what evaluation returns and the only part anyone authoring a flag
 * actually thinks about. `label` is an optional human name for it, for when
 * the value alone is not self-describing ("#0F766E", or a JSON blob).
 *
 * `key` is a STABLE INTERNAL IDENTIFIER and is not shown when authoring. It
 * exists because targeting rules and percentage rollouts point at a variant,
 * and they have to keep pointing at the same one after somebody edits its
 * value. Deriving the reference from the value instead would silently
 * repoint every rule the moment a colour changed. It is generated on the
 * caller's behalf by the console; the REST API still accepts an explicit one.
 */
export type Variant = { key: string; value: FlagValue; label?: string };

/** What to show a person for a variant: their label, else the value itself. */
export function variantLabel(variant: Variant, type: FlagType): string {
  const label = variant.label?.trim();
  if (label) return label;
  if (type === "boolean") return variant.key === "on" ? "On" : "Off";
  // A JSON blob is unreadable inline, so fall back to the identifier.
  if (type === "object") return variant.key;
  const value = String(variant.value);
  return value === "" ? "(empty)" : value;
}

/**
 * A stable key for a new variant, derived from its value.
 *
 * Only ever called when a variant is CREATED. Once a rule can reference it,
 * the key stops tracking the value: renaming "blue" to "azure" must not move
 * the rules that serve it.
 */
export function deriveVariantKey(
  value: string,
  taken: Iterable<string>,
): string {
  const used = new Set(taken);
  // Only slugify a value that reads as a word. `suggestFlagKey` strips leading
  // non-letters to satisfy FLAG_KEY_PATTERN, which turns "#2dd4bf" into
  // "dd4bf" - a key that is valid, permanent, and says nothing. Keys surface
  // in API responses and OFREP payloads, so a neutral "variant-2" beats a
  // mangled fragment of a colour code.
  const readable = /^[a-z]/i.test(value.trim());
  const base = (readable && suggestFlagKey(value)) || "variant";
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
export type Operator = (typeof OPERATORS)[number];
export type CriterionValueType =
  "string" | "number" | "boolean" | "datetime" | "list";
export type AttributeCriterion = {
  kind: "attribute";
  attribute: string;
  operator: Operator;
  value?: unknown;
  valueType?: CriterionValueType;
};
export type SegmentCriterion = {
  kind: "segment";
  segment: string;
  negate?: boolean;
};
export type CriteriaGroup = {
  operator: "all" | "any";
  items: Array<AttributeCriterion | SegmentCriterion | CriteriaGroup>;
};
export type Rollout = { variant: string; weight: number };
export type TargetingRule = {
  id?: string;
  name?: string;
  criteria: CriteriaGroup;
  variant?: string;
  rollout?: Rollout[];
};
export type SegmentDefinition = { key: string; criteria: CriteriaGroup };
export type EvaluationContext = {
  targetingKey: string;
  [key: string]: unknown;
};
export type EvaluableFlag = {
  key: string;
  type: FlagType;
  variants: Variant[];
  defaultVariant: string;
  rules: TargetingRule[];
};

export const emptyCriteria = (): CriteriaGroup => ({
  operator: "all",
  items: [],
});
export function normalizeFlagKey(value: string) {
  return value.trim().toLowerCase().split(" ").filter(Boolean).join("-");
}
export function suggestFlagKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/g, "")
    .slice(0, 128);
}
export function validateKeyAndName(input: { key: string; name: string }) {
  const key = normalizeFlagKey(input.key);
  const name = input.name.trim();
  if (!FLAG_KEY_PATTERN.test(key))
    return {
      ok: false as const,
      code: "invalid_key",
      error:
        "Use a lowercase key beginning with a letter; letters, numbers, dots, underscores, and hyphens are allowed.",
    };
  if (!name || name.length > 100)
    return {
      ok: false as const,
      code: "invalid_name",
      error: "Provide a name up to 100 characters.",
    };
  return { ok: true as const, key, name };
}
export function defaultVariants(type: FlagType, raw?: unknown): Variant[] {
  if (type === "boolean")
    return [
      { key: "off", value: false },
      { key: "on", value: true },
    ];
  const fallback = type === "string" ? "" : type === "object" ? {} : 0;
  return [{ key: "default", value: coerceValue(type, raw ?? fallback) }];
}
export function coerceValue(type: FlagType, value: unknown): FlagValue {
  if (type === "boolean") {
    if (typeof value !== "boolean")
      throw new Error("Boolean variants require true or false.");
    return value;
  }
  if (type === "string") {
    if (typeof value !== "string")
      throw new Error("String variants require strings.");
    return value;
  }
  if (type === "integer") {
    if (typeof value !== "number" || !Number.isSafeInteger(value))
      throw new Error("Integer variants require a safe whole number.");
    return value;
  }
  if (type === "float") {
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error("Float variants require a finite number.");
    return value;
  }
  if (!value || typeof value !== "object")
    throw new Error("Object variants require a JSON object or array.");
  return value as Record<string, unknown> | unknown[];
}
function isGroup(value: unknown): value is CriteriaGroup {
  return Boolean(
    value &&
    typeof value === "object" &&
    (value as CriteriaGroup).operator &&
    Array.isArray((value as CriteriaGroup).items),
  );
}
function attribute(context: EvaluationContext, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, part) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined,
      context,
    );
}
export function matchesAttribute(
  criterion: AttributeCriterion,
  context: EvaluationContext,
): boolean {
  const actual = attribute(context, criterion.attribute);
  const expected = criterion.value;
  const actualComparable =
    criterion.valueType === "datetime" && typeof actual === "string"
      ? Date.parse(actual)
      : actual;
  const expectedComparable =
    criterion.valueType === "datetime" && typeof expected === "string"
      ? Date.parse(expected)
      : expected;
  switch (criterion.operator) {
    case "exists":
      return actual !== undefined && actual !== null;
    case "not_exists":
      return actual === undefined || actual === null;
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    case "contains":
      return (
        (typeof actual === "string" && actual.includes(String(expected))) ||
        (Array.isArray(actual) && actual.includes(expected))
      );
    case "not_contains":
      return !(
        (typeof actual === "string" && actual.includes(String(expected))) ||
        (Array.isArray(actual) && actual.includes(expected))
      );
    case "starts_with":
      return typeof actual === "string" && actual.startsWith(String(expected));
    case "ends_with":
      return typeof actual === "string" && actual.endsWith(String(expected));
    case "greater_than":
      return (
        typeof actualComparable === "number" &&
        Number.isFinite(actualComparable) &&
        actualComparable > Number(expectedComparable)
      );
    case "greater_than_or_equal":
      return (
        typeof actualComparable === "number" &&
        Number.isFinite(actualComparable) &&
        actualComparable >= Number(expectedComparable)
      );
    case "less_than":
      return (
        typeof actualComparable === "number" &&
        Number.isFinite(actualComparable) &&
        actualComparable < Number(expectedComparable)
      );
    case "less_than_or_equal":
      return (
        typeof actualComparable === "number" &&
        Number.isFinite(actualComparable) &&
        actualComparable <= Number(expectedComparable)
      );
  }
}
export function matchesCriteria(
  group: CriteriaGroup,
  segments: SegmentDefinition[],
  context: EvaluationContext,
  visiting = new Set<string>(),
): boolean {
  const results = group.items.map((item) => {
    if (isGroup(item))
      return matchesCriteria(item, segments, context, visiting);
    if (item.kind === "attribute") return matchesAttribute(item, context);
    if (visiting.has(item.segment)) return false;
    const segment = segments.find(
      (candidate) => candidate.key === item.segment,
    );
    if (!segment) return false;
    const next = new Set(visiting);
    next.add(item.segment);
    const matched = matchesCriteria(segment.criteria, segments, context, next);
    return item.negate ? !matched : matched;
  });
  return group.operator === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}
/** FNV-1a is portable across future relay implementations. */
export function rolloutBucket(flagKey: string, targetingKey: string): number {
  let hash = 0x811c9dc5;
  for (const character of `${flagKey}:${targetingKey}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100_000;
}
function chooseRollout(
  flagKey: string,
  targetingKey: string,
  rollout: Rollout[],
) {
  const point = rolloutBucket(flagKey, targetingKey) / 1000;
  let cursor = 0;
  for (const item of rollout) {
    cursor += item.weight;
    if (point < cursor) return item.variant;
  }
  return null;
}
export function validateDefinition(
  type: FlagType,
  variants: Variant[],
  defaultVariant: string,
  rules: TargetingRule[],
  segmentKeys?: Set<string>,
) {
  if (!variants.length) return "Add at least one variant.";
  const keys = new Set<string>();
  try {
    for (const variant of variants) {
      if (!FLAG_KEY_PATTERN.test(variant.key) || keys.has(variant.key))
        return "Variant keys must be unique valid keys.";
      if (variant.label !== undefined && variant.label.length > 60)
        return "Variant labels must be 60 characters or fewer.";
      keys.add(variant.key);
      coerceValue(type, variant.value);
    }
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid variant value.";
  }
  if (!keys.has(defaultVariant)) return "The fallback variant must exist.";
  const checkGroup = (group: CriteriaGroup, depth = 0): string | null => {
    if (
      !isGroup(group) ||
      !["all", "any"].includes(group.operator) ||
      depth > 5
    )
      return "Invalid or overly nested criteria group.";
    for (const item of group.items) {
      if (isGroup(item)) {
        const error = checkGroup(item, depth + 1);
        if (error) return error;
      } else if (item.kind === "attribute") {
        if (!item.attribute || !OPERATORS.includes(item.operator))
          return "Every attribute criterion needs an attribute and operator.";
      } else if (item.kind === "segment") {
        if (!item.segment || (segmentKeys && !segmentKeys.has(item.segment)))
          return `Unknown segment '${item.segment}'.`;
      } else return "Unknown criterion type.";
    }
    return null;
  };
  for (const rule of rules) {
    const criteriaError = checkGroup(rule.criteria);
    if (criteriaError) return criteriaError;
    if (rule.variant && rule.rollout)
      return "A rule cannot serve both a variant and a rollout.";
    if (rule.variant && !keys.has(rule.variant))
      return `Unknown variant '${rule.variant}'.`;
    if (rule.rollout) {
      if (
        rule.rollout.some(
          (item) => !keys.has(item.variant) || item.weight < 0,
        ) ||
        Math.abs(
          rule.rollout.reduce((sum, item) => sum + item.weight, 0) - 100,
        ) > 0.001
      )
        return "Rollout weights must reference valid variants and total 100%.";
    }
    if (!rule.variant && !rule.rollout) return "Every rule needs an outcome.";
  }
  return null;
}
export function evaluateFlag(
  flag: EvaluableFlag,
  segments: SegmentDefinition[],
  context: EvaluationContext,
) {
  const variants = new Map(
    flag.variants.map((variant) => [variant.key, variant]),
  );
  for (const rule of flag.rules) {
    if (!matchesCriteria(rule.criteria, segments, context)) continue;
    const variantKey =
      rule.variant ??
      (rule.rollout
        ? chooseRollout(flag.key, context.targetingKey, rule.rollout)
        : null);
    const variant = variantKey ? variants.get(variantKey) : null;
    if (variant)
      return {
        key: flag.key,
        value: variant.value,
        variant: variant.key,
        reason: rule.rollout
          ? ("SPLIT" as const)
          : ("TARGETING_MATCH" as const),
      };
  }
  const variant = variants.get(flag.defaultVariant);
  if (!variant) throw new Error(`Flag '${flag.key}' has no fallback variant.`);
  return {
    key: flag.key,
    value: variant.value,
    variant: variant.key,
    reason: "STATIC" as const,
  };
}
