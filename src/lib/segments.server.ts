import { and, desc, eq } from "drizzle-orm";
import { isUniqueViolation } from "@/db/errors";
import { segments } from "@/db/schema";
import { withTenant } from "@/db/tenant";
import {
  emptyCriteria,
  FLAG_KEY_PATTERN,
  normalizeFlagKey,
  type CriteriaGroup,
} from "./flags";

export type Segment = typeof segments.$inferSelect;
export const listSegments = (orgId: string) =>
  withTenant(orgId, (tx) =>
    tx.select().from(segments).orderBy(desc(segments.updatedAt)),
  );
export async function getSegment(orgId: string, key: string) {
  const [segment] = await withTenant(orgId, (tx) =>
    tx
      .select()
      .from(segments)
      .where(and(eq(segments.organizationId, orgId), eq(segments.key, key)))
      .limit(1),
  );
  return segment ?? null;
}
function valid(input: { key: string; name: string }) {
  const key = normalizeFlagKey(input.key);
  const name = input.name.trim();
  return FLAG_KEY_PATTERN.test(key) && name ? { key, name } : null;
}
export async function createSegment(
  orgId: string,
  input: {
    key: string;
    name: string;
    description?: string;
    criteria?: CriteriaGroup;
  },
) {
  const identity = valid(input);
  if (!identity)
    return {
      ok: false as const,
      code: "invalid_segment",
      error: "Provide a valid segment name and key.",
    };
  try {
    const [segment] = await withTenant(orgId, (tx) =>
      tx
        .insert(segments)
        .values({
          organizationId: orgId,
          ...identity,
          description: input.description?.trim() || null,
          criteria: input.criteria ?? emptyCriteria(),
        })
        .returning(),
    );
    return { ok: true as const, segment };
  } catch (error) {
    if (isUniqueViolation(error))
      return {
        ok: false as const,
        code: "key_taken",
        error: "That segment key already exists.",
      };
    throw error;
  }
}
export async function updateSegment(
  orgId: string,
  key: string,
  input: {
    name?: string;
    description?: string | null;
    criteria?: CriteriaGroup;
  },
) {
  const current = await getSegment(orgId, key);
  if (!current)
    return {
      ok: false as const,
      code: "not_found",
      error: "Segment not found.",
    };
  const identity = valid({ key, name: input.name ?? current.name });
  if (!identity)
    return {
      ok: false as const,
      code: "invalid_segment",
      error: "Provide a valid segment name.",
    };
  const [segment] = await withTenant(orgId, (tx) =>
    tx
      .update(segments)
      .set({
        name: identity.name,
        description:
          input.description === undefined
            ? current.description
            : input.description?.trim() || null,
        criteria: input.criteria ?? current.criteria,
        updatedAt: new Date(),
      })
      .where(and(eq(segments.organizationId, orgId), eq(segments.key, key)))
      .returning(),
  );
  return { ok: true as const, segment };
}
export async function deleteSegment(orgId: string, key: string) {
  return (
    (
      await withTenant(orgId, (tx) =>
        tx
          .delete(segments)
          .where(and(eq(segments.organizationId, orgId), eq(segments.key, key)))
          .returning({ id: segments.id }),
      )
    ).length > 0
  );
}
export function serializeSegment(segment: Segment) {
  return {
    id: segment.id,
    key: segment.key,
    name: segment.name,
    description: segment.description,
    criteria: segment.criteria,
    created_at: segment.createdAt.toISOString(),
    updated_at: segment.updatedAt.toISOString(),
  };
}
