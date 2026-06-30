/**
 * Flagon core types — the canonical, framework-free contract shared by:
 *   - the bundle compiler (control plane, TypeScript)
 *   - the evaluation engine (this package, TypeScript)
 *   - the future Go data plane (a verbatim port reading the same bundle JSON)
 *
 * NOTHING in `src/core` may import from Next, the DB, or any runtime-specific
 * API. It is pure data + pure functions so it can be lifted into another
 * language or process unchanged. This is the "extraction-ready" seam.
 *
 * The bundle shape is intentionally a superset of the OpenFeature / flagd flag
 * definition format so that exports remain interoperable with the wider
 * OpenFeature ecosystem.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type FlagState = 'ENABLED' | 'DISABLED';

/** OpenFeature value types. `object` covers arrays and JSON objects. */
export type FlagType = 'boolean' | 'string' | 'number' | 'object';

/** A boolean expression over the evaluation context. Tree-shaped, no eval(). */
export type Condition =
  | { op: 'true' }
  | { op: 'all'; of: Condition[] }
  | { op: 'any'; of: Condition[] }
  | { op: 'not'; of: Condition }
  | { op: 'eq' | 'ne'; attr: string; value: JsonValue }
  | { op: 'in' | 'nin'; attr: string; values: JsonValue[] }
  | { op: 'contains' | 'starts_with' | 'ends_with'; attr: string; value: string }
  | { op: 'gt' | 'gte' | 'lt' | 'lte'; attr: string; value: number }
  | { op: 'semver'; attr: string; cmp: '=' | '>' | '>=' | '<' | '<='; value: string }
  | { op: 'segment'; ref: string };

/** Resolve to a single variant, or split traffic across variants by weight. */
export type Outcome =
  | { variant: string }
  | {
      /** Weighted split. Weights are relative; they need not sum to any total. */
      fractional: Array<{ variant: string; weight: number }>;
      /**
       * Context attribute used to bucket a subject deterministically.
       * Defaults to `targetingKey`. Same subject + same flag => same bucket.
       */
      bucketBy?: string;
    };

export interface TargetingRule {
  id?: string;
  when: Condition;
  then: Outcome;
}

export interface FlagDefinition {
  state: FlagState;
  type: FlagType;
  /** Variant name -> typed value. */
  variants: Record<string, JsonValue>;
  /** Variant returned when no rule matches (and when DISABLED). */
  defaultVariant: string;
  /** Ordered rules; first whose `when` matches wins. */
  targeting?: TargetingRule[];
}

/**
 * A compiled, immutable snapshot of one environment's flags. This is the blob
 * written to the bundle store (R2 / Postgres) and read on the hot path. The
 * evaluator never touches the database — only a Bundle.
 */
export interface Bundle {
  schemaVersion: 1;
  /** Opaque identifier of the owning environment (not used during eval). */
  environmentId: string;
  /** Version / cache key. Changes whenever any flag changes. */
  etag: string;
  /** ISO-8601 generation timestamp. */
  generatedAt: string;
  flags: Record<string, FlagDefinition>;
  /** Named, reusable conditions referenced by `{ op: 'segment', ref }`. */
  segments: Record<string, Condition>;
}

/** OpenFeature evaluation context. `targetingKey` is the OFREP-standard subject id. */
export interface EvaluationContext {
  targetingKey?: string;
  [attribute: string]: JsonValue | undefined;
}

/** OFREP-compatible reason codes. */
export type EvaluationReason =
  | 'STATIC'
  | 'DEFAULT'
  | 'TARGETING_MATCH'
  | 'SPLIT'
  | 'DISABLED'
  | 'ERROR'
  | 'UNKNOWN';

/** OFREP-compatible error codes. */
export type ErrorCode =
  | 'FLAG_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'TYPE_MISMATCH'
  | 'TARGETING_KEY_MISSING'
  | 'INVALID_CONTEXT'
  | 'GENERAL';

/** Result of evaluating a single flag — maps 1:1 onto an OFREP response object. */
export interface EvaluationResult {
  key: string;
  value: JsonValue;
  reason: EvaluationReason;
  variant?: string;
  errorCode?: ErrorCode;
  errorDetails?: string;
  metadata?: Record<string, JsonValue>;
}
