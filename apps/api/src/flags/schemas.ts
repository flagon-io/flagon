import { z } from "zod";
import type { JsonValue, Predicate } from "./types.js";

/**
 * Zod for the jsonb shapes the eval engine reads — conditions (predicates) and
 * serve (variant or rollout). Writes go through these so the stored shape is
 * always exactly what the engine expects; nothing hand-rolled can slip in.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const operatorSchema = z.enum([
  "eq",
  "neq",
  "in",
  "nin",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "exists",
  "not_exists",
  "before",
  "after",
  "semver_eq",
  "semver_gt",
  "semver_ge",
  "semver_lt",
  "semver_le",
]);
// `regex` intentionally omitted from the writable set for now — accepting
// arbitrary regexes from clients is a footgun (ReDoS); the engine still supports
// it for internal use.

/**
 * A predicate is a leaf (attribute comparison / segment reference) or a branch
 * (`all` = AND, `any` = OR) of further predicates, nestable to any depth — so
 * targeting supports arbitrary AND/OR clauses. Recursive, hence z.lazy.
 */
export const predicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.object({
      attribute: z.string().min(1).max(200),
      op: operatorSchema,
      values: z.array(jsonValueSchema).max(200).optional(),
    }),
    z.object({ segment: z.string().min(1).max(200) }),
    z.object({ all: z.array(predicateSchema).max(50) }),
    z.object({ any: z.array(predicateSchema).max(50) }),
  ]),
);

export const conditionsSchema = z.array(predicateSchema).max(50);

export const serveSchema = z.union([
  z.object({ variant: z.string().min(1) }),
  z.object({
    rollout: z
      .array(
        z.object({ variant: z.string().min(1), weight: z.number().min(0).max(1_000_000) }),
      )
      .min(1)
      .max(64),
    bucketBy: z.string().min(1).max(200).optional(),
  }),
]);

export type ConditionsInput = z.infer<typeof conditionsSchema>;
export type ServeInput = z.infer<typeof serveSchema>;

/**
 * Collect every variant key a `serve` references, so a handler can verify they
 * all exist on the flag before storing the rule.
 */
export function variantKeysInServe(serve: ServeInput): string[] {
  return "variant" in serve
    ? [serve.variant]
    : serve.rollout.map((r) => r.variant);
}

/** Collect every segment key referenced by a set of conditions, recursing into
 * all/any groups. */
export function segmentKeysInConditions(conditions: ConditionsInput): string[] {
  const keys: string[] = [];
  const walk = (p: Predicate) => {
    if ("all" in p) p.all.forEach(walk);
    else if ("any" in p) p.any.forEach(walk);
    else if ("segment" in p) keys.push(p.segment);
  };
  conditions.forEach(walk);
  return keys;
}
