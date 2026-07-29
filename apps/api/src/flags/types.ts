/**
 * The evaluation domain — the shapes the eval engine works with, independent of
 * how they're stored or transported. The DB config loader (config.ts) projects
 * rows into these; the OFREP routes project the result back out.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * The context an SDK sends: a `targetingKey` (the stable identity used for
 * bucketing) plus arbitrary attributes. Attributes may be nested (e.g.
 * `{ user: { plan: "pro" } }`) and referenced by dotted path in conditions.
 */
export type EvaluationContext = {
  targetingKey?: string;
  [key: string]: JsonValue | undefined;
};

export type Operator =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists"
  | "not_exists"
  | "regex"
  // Time comparisons. The engine resolves the reserved `$currentTime` attribute
  // to the server's clock, so `{ attribute: "$currentTime", op: "after", values:
  // [iso] }` means "now is after <iso>". Values may be ISO strings or epoch ms.
  | "before"
  | "after"
  // Semantic-version comparisons (e.g. app version "1.4.0" >= "1.2.0"). Both
  // sides are parsed as dotted numeric versions; non-version input never matches.
  | "semver_eq"
  | "semver_gt"
  | "semver_ge"
  | "semver_lt"
  | "semver_le";

/**
 * One node in a rule/segment condition tree. A leaf is either a comparison on a
 * context attribute or a reference to a named segment; a branch is an `all` (AND)
 * or `any` (OR) group of further nodes, nestable to any depth. A flat list of
 * predicates is implicitly ANDed, so `[A, B]` and `[{ all: [A, B] }]` mean the
 * same thing — but `[{ any: [A, B] }]` means A OR B.
 */
export type Predicate =
  | { attribute: string; op: Operator; values?: JsonValue[] }
  | { segment: string }
  | { all: Predicate[] }
  | { any: Predicate[] };

/** A rollout slice: serve `variant` to `weight` share of traffic. */
export type RolloutEntry = { variant: string; weight: number };

/**
 * What a matched rule serves: a single variant, or a weighted split across
 * variants bucketed deterministically by `bucketBy` (defaults to targetingKey).
 */
export type Serve =
  | { variant: string }
  | { rollout: RolloutEntry[]; bucketBy?: string };

export type RuleConfig = {
  id?: string;
  priority: number;
  /** ANDed together; a rule matches when every predicate matches. */
  conditions: Predicate[];
  serve: Serve;
  description?: string | null;
};

export type VariantConfig = {
  id: string;
  key: string;
  value: JsonValue;
};

export type FlagType = "boolean" | "string" | "number" | "json";

/** Everything needed to evaluate one flag in one environment. */
export type FlagConfig = {
  /** The flag's row id, carried so eval-time usage can be bucketed by flag. */
  id: string;
  key: string;
  type: FlagType;
  variants: VariantConfig[];
  enabled: boolean;
  /**
   * The default served when enabled and no rule matches. When `defaultServe` is
   * set it wins (letting the default itself be a rollout); otherwise the single
   * `defaultVariantKey` is served. `defaultVariantKey` also remains the ultimate
   * fallback if a default rollout is degenerate.
   */
  defaultVariantKey: string | null;
  defaultServe: Serve | null;
  offVariantKey: string | null;
  rules: RuleConfig[];
};

export type SegmentConfig = {
  key: string;
  /** ANDed together. */
  conditions: Predicate[];
};

/** OpenFeature standard evaluation reasons we emit. */
export type EvaluationReason =
  | "STATIC"
  | "DEFAULT"
  | "TARGETING_MATCH"
  | "SPLIT"
  | "DISABLED"
  | "ERROR";

/** OFREP-shaped single-flag result. */
export type EvaluationResult = {
  key: string;
  value: JsonValue;
  variant?: string;
  reason: EvaluationReason;
  errorCode?: string;
  errorDetails?: string;
  metadata?: Record<string, JsonValue>;
};
