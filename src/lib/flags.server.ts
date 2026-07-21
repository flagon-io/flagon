import { and, desc, eq } from "drizzle-orm";
import { isUniqueViolation } from "@/db/errors";
import { featureFlags, segments } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import { defaultVariants, FLAG_TYPES, type EvaluableFlag, type FlagType, type TargetingRule, type Variant, validateDefinition, validateKeyAndName } from "./flags";

export type FeatureFlag = typeof featureFlags.$inferSelect;
export const listFlags = (orgId: string) => withTenant(orgId, (tx) => tx.select().from(featureFlags).orderBy(desc(featureFlags.updatedAt)));
export async function getFlag(orgId: string, key: string) {
  const [flag] = await withTenant(orgId, (tx) => tx.select().from(featureFlags).where(and(eq(featureFlags.organizationId, orgId), eq(featureFlags.key, key))).limit(1));
  return flag ?? null;
}

type FlagInput = { key: string; name: string; description?: string; type?: FlagType; variants?: Variant[]; defaultVariant?: string; rules?: TargetingRule[] };
export async function createFlag(orgId: string, input: FlagInput) {
  const valid = validateKeyAndName(input);
  if (!valid.ok) return valid;
  const type = input.type && FLAG_TYPES.includes(input.type) ? input.type : "boolean";
  const variants = input.variants?.length ? input.variants : defaultVariants(type);
  const defaultVariant = input.defaultVariant ?? variants[0].key;
  const rules = input.rules ?? [];
  const segmentKeys = new Set((await withTenant(orgId, (tx) => tx.select({ key: segments.key }).from(segments))).map((item) => item.key));
  const definitionError = validateDefinition(type, variants, defaultVariant, rules, segmentKeys);
  if (definitionError) return { ok: false as const, code: "invalid_definition", error: definitionError };
  try {
    const [flag] = await withTenant(orgId, (tx) => tx.insert(featureFlags).values({
      organizationId: orgId, key: valid.key, name: valid.name,
      description: input.description?.trim() || null, type, variants,
      defaultVariant, rules,
    }).returning());
    return { ok: true as const, flag };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false as const, code: "key_taken", error: "That flag key already exists." };
    throw error;
  }
}

export async function updateFlag(orgId: string, key: string, input: Partial<Omit<FlagInput, "key">>) {
  const current = await getFlag(orgId, key);
  if (!current) return { ok: false as const, code: "not_found", error: "Flag not found." };
  const valid = validateKeyAndName({ key, name: input.name ?? current.name });
  if (!valid.ok) return valid;
  const variants = input.variants ?? current.variants;
  const defaultVariant = input.defaultVariant ?? current.defaultVariant;
  const type = (input.type ?? current.type) as FlagType;
  const rules = (input.rules ?? current.rules) as TargetingRule[];
  const segmentKeys = new Set((await withTenant(orgId, (tx) => tx.select({ key: segments.key }).from(segments))).map((item) => item.key));
  const definitionError = validateDefinition(type, variants as Variant[], defaultVariant, rules, segmentKeys);
  if (definitionError) return { ok: false as const, code: "invalid_definition", error: definitionError };
  const [flag] = await withTenant(orgId, (tx) => tx.update(featureFlags).set({
    name: valid.name, description: input.description === undefined ? current.description : input.description?.trim() || null,
    type, variants, defaultVariant, rules, updatedAt: new Date(),
  }).where(and(eq(featureFlags.organizationId, orgId), eq(featureFlags.key, key))).returning());
  return { ok: true as const, flag };
}

export async function deleteFlag(orgId: string, key: string) {
  return (await withTenant(orgId, (tx) => tx.delete(featureFlags).where(and(eq(featureFlags.organizationId, orgId), eq(featureFlags.key, key))).returning({ id: featureFlags.id }))).length > 0;
}

export function serializeFlag(flag: FeatureFlag) {
  return { id: flag.id, key: flag.key, name: flag.name, description: flag.description, type: flag.type,
    variants: flag.variants, default_variant: flag.defaultVariant, rules: flag.rules,
    created_at: flag.createdAt.toISOString(), updated_at: flag.updatedAt.toISOString() };
}

export function asEvaluableFlag(flag: FeatureFlag): EvaluableFlag {
  return {
    key: flag.key,
    type: flag.type as FlagType,
    variants: flag.variants as Variant[],
    defaultVariant: flag.defaultVariant,
    rules: flag.rules as TargetingRule[],
  };
}
