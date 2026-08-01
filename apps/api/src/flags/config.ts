import { and, eq, inArray } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import {
  flagEnvironments,
  flagRules,
  flagVariants,
  flags,
  segments as segmentsTable,
} from "../db/schema.js";
import type {
  FlagConfig,
  FlagType,
  JsonValue,
  Predicate,
  SegmentConfig,
  Serve,
} from "./types.js";

/**
 * Load everything the eval engine needs for one environment, projected from the
 * relational tables into the flat FlagConfig shape.
 *
 * MUST run inside withOrg(): every query here reads tenant tables, so RLS scopes
 * them to the caller's org automatically. Pass a `flagKey` to load a single flag
 * (single-flag OFREP eval), or omit it to load every flag (bulk).
 *
 * Archived flags STILL evaluate: archiving means "retiring, remove from code"
 * but code that still references the flag must keep resolving to its configured
 * value. Only deletion (the row is gone) stops evaluation. So we do not filter
 * on archivedAt here.
 *
 * A flag with no configuration row in this environment is omitted — from the
 * caller's perspective it does not exist here.
 */
export type EvaluationData = {
  flags: FlagConfig[];
  segments: Map<string, SegmentConfig>;
};

export async function loadEvaluationData(
  tx: TenantTx,
  environmentId: string,
  flagKey?: string,
): Promise<EvaluationData> {
  const flagRows = await tx
    .select()
    .from(flags)
    .where(flagKey ? eq(flags.key, flagKey) : undefined);

  const segments = await loadSegments(tx);
  if (flagRows.length === 0) return { flags: [], segments };

  const flagIds = flagRows.map((f) => f.id);
  const [variantRows, feRows] = await Promise.all([
    tx.select().from(flagVariants).where(inArray(flagVariants.flagId, flagIds)),
    tx
      .select()
      .from(flagEnvironments)
      .where(
        and(
          eq(flagEnvironments.environmentId, environmentId),
          inArray(flagEnvironments.flagId, flagIds),
        ),
      ),
  ]);

  // Resolve the "Reuse" mode: a row with reuse_source_environment_id INHERITS the
  // source environment's config for the same flag. One level only — a source that
  // itself reuses is not chained (its own stored config is used) — so this can't
  // loop. Null source (the common case) means the row uses its own config, so
  // evaluation is unchanged for every flag not explicitly put in Reuse mode.
  const reuseSourceEnvIds = [
    ...new Set(
      feRows.map((fe) => fe.reuseSourceEnvironmentId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const sourceFeByFlagEnv = new Map<string, (typeof feRows)[number]>();
  if (reuseSourceEnvIds.length) {
    const sourceRows = await tx
      .select()
      .from(flagEnvironments)
      .where(
        and(
          inArray(flagEnvironments.environmentId, reuseSourceEnvIds),
          inArray(flagEnvironments.flagId, flagIds),
        ),
      );
    for (const fe of sourceRows) {
      sourceFeByFlagEnv.set(`${fe.flagId}:${fe.environmentId}`, fe);
    }
  }

  // The EFFECTIVE config row per flag: the source row when reusing (falling back to
  // the flag's own row if the source isn't configured), else its own row.
  const effectiveFeByFlag = new Map<string, (typeof feRows)[number]>();
  for (const fe of feRows) {
    const source = fe.reuseSourceEnvironmentId
      ? sourceFeByFlagEnv.get(`${fe.flagId}:${fe.reuseSourceEnvironmentId}`)
      : undefined;
    effectiveFeByFlag.set(fe.flagId, source ?? fe);
  }

  const feIds = [...new Set([...effectiveFeByFlag.values()].map((fe) => fe.id))];
  const ruleRows = feIds.length
    ? await tx
        .select()
        .from(flagRules)
        .where(inArray(flagRules.flagEnvironmentId, feIds))
    : [];

  const variantsByFlag = groupBy(variantRows, (v) => v.flagId);
  const feByFlag = effectiveFeByFlag;
  const rulesByFe = groupBy(ruleRows, (r) => r.flagEnvironmentId);

  const configs: FlagConfig[] = [];
  for (const flag of flagRows) {
    const fe = feByFlag.get(flag.id);
    if (!fe) continue; // not configured in this environment

    const variants = (variantsByFlag.get(flag.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const keyById = new Map(variants.map((v) => [v.id, v.key]));

    const rules = (rulesByFe.get(fe.id) ?? []).map((r) => ({
      id: r.id,
      priority: r.priority,
      description: r.description,
      conditions: (r.conditions as Predicate[]) ?? [],
      serve: r.serve as Serve,
    }));

    configs.push({
      id: flag.id,
      key: flag.key,
      type: flag.type as FlagType,
      variants: variants.map((v) => ({
        id: v.id,
        key: v.key,
        value: v.value as JsonValue,
      })),
      enabled: fe.enabled,
      defaultVariantKey: fe.defaultVariantId
        ? (keyById.get(fe.defaultVariantId) ?? null)
        : null,
      defaultServe: (fe.defaultServe as Serve | null) ?? null,
      offVariantKey: fe.offVariantId
        ? (keyById.get(fe.offVariantId) ?? null)
        : null,
      rules,
    });
  }

  return { flags: configs, segments };
}

async function loadSegments(
  tx: TenantTx,
): Promise<Map<string, SegmentConfig>> {
  const rows = await tx.select().from(segmentsTable);
  return new Map(
    rows.map((s) => [
      s.key,
      { key: s.key, conditions: (s.conditions as Predicate[]) ?? [] },
    ]),
  );
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const existing = out.get(k);
    if (existing) existing.push(item);
    else out.set(k, [item]);
  }
  return out;
}
