import { asc, eq, inArray } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import {
  environments,
  flagEnvironments,
  flagRevisions,
  flagRules,
  flagVariants,
  flags,
} from "../db/schema.js";
import type { JsonValue } from "./types.js";

/**
 * A complete, replayable snapshot of a flag's config at a point in time: its
 * variants and, per environment, the on/off state, default/off variants, and the
 * ordered targeting rules. Stored on every revision so the audit trail can show
 * (and restore) exactly what the flag looked like at any point — data that can
 * never be reconstructed from human-readable diffs alone.
 */
export async function buildFlagSnapshot(
  tx: TenantTx,
  flagId: string,
): Promise<JsonValue | null> {
  const flag = (
    await tx.select().from(flags).where(eq(flags.id, flagId)).limit(1)
  )[0];
  if (!flag) return null;

  const [variantRows, feRows, envRows] = await Promise.all([
    tx.select().from(flagVariants).where(eq(flagVariants.flagId, flagId)),
    tx.select().from(flagEnvironments).where(eq(flagEnvironments.flagId, flagId)),
    tx.select().from(environments),
  ]);

  const feIds = feRows.map((fe) => fe.id);
  const ruleRows = feIds.length
    ? await tx
        .select()
        .from(flagRules)
        .where(inArray(flagRules.flagEnvironmentId, feIds))
        .orderBy(asc(flagRules.priority))
    : [];

  const variantKeyById = new Map(variantRows.map((v) => [v.id, v.key]));
  const envById = new Map(envRows.map((e) => [e.id, e]));
  const rulesByFe = new Map<string, typeof ruleRows>();
  for (const r of ruleRows) {
    const list = rulesByFe.get(r.flagEnvironmentId);
    if (list) list.push(r);
    else rulesByFe.set(r.flagEnvironmentId, [r]);
  }

  return {
    flag: {
      key: flag.key,
      type: flag.type,
      name: flag.name,
      description: flag.description,
      permanent: flag.permanent,
      tags: flag.tags,
      maintainerUserId: flag.maintainerUserId,
      archivedAt: flag.archivedAt ? flag.archivedAt.toISOString() : null,
    },
    variants: [...variantRows]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        key: v.key,
        value: v.value as JsonValue,
        label: v.label,
        sortOrder: v.sortOrder,
      })),
    environments: feRows.map((fe) => ({
      key: envById.get(fe.environmentId)?.key ?? null,
      name: envById.get(fe.environmentId)?.name ?? null,
      enabled: fe.enabled,
      defaultVariantKey: fe.defaultVariantId
        ? (variantKeyById.get(fe.defaultVariantId) ?? null)
        : null,
      offVariantKey: fe.offVariantId
        ? (variantKeyById.get(fe.offVariantId) ?? null)
        : null,
      rules: (rulesByFe.get(fe.id) ?? []).map((r) => ({
        priority: r.priority,
        description: r.description,
        conditions: r.conditions as JsonValue,
        serve: r.serve as JsonValue,
      })),
    })),
  } as JsonValue;
}

/**
 * Append an entry to a flag's audit log. Every mutation records one, so the
 * flag's history — who changed what, when, and the full resulting config — is
 * reconstructable (the "Recent Revisions" panel and full history). Runs inside
 * the same withOrg() transaction as the change it describes, so the record and
 * the change commit together, and the snapshot reflects the post-change state.
 */
export async function recordRevision(
  tx: TenantTx,
  input: {
    organizationId: string;
    flagId: string;
    actorUserId: string | null;
    action: string;
    summary?: string;
    diff?: JsonValue;
  },
): Promise<void> {
  const snapshot = await buildFlagSnapshot(tx, input.flagId);
  await tx.insert(flagRevisions).values({
    organizationId: input.organizationId,
    flagId: input.flagId,
    userId: input.actorUserId,
    action: input.action,
    summary: input.summary ?? null,
    diff: input.diff ?? null,
    snapshot,
  });
}
