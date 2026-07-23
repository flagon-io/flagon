import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { getConfigStore } from "@/lib/config-store";
import {
  writeConfigArtifact,
  type PublishResult,
} from "@/lib/flag-config-cache.server";

/** A tenant transaction handle, as handed to a `withTenant` callback. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Durable publication tracking for the OFREP config store. The database is the
 * source of truth; the store is a derived copy. The danger this module removes
 * is a "stale but present" artifact - a change committed to the database whose
 * write-through to the store failed, leaving the store serving the old value
 * with no signal that it is wrong.
 *
 * The mechanism mirrors usage compaction (usage-events.server.ts): a dirty
 * marker on `organizations` (a table readable without a tenant context) set in
 * the SAME transaction as the change, so the intent to publish is durable the
 * instant the change is. `publishConfig` writes the artifact and clears the
 * marker; `reconcileDirtyConfigs` sweeps whatever is left set. A store failure -
 * even a total outage - can therefore only DELAY a publish, never lose one.
 */

/**
 * Mark an org's config dirty within the caller's transaction. MUST run in the
 * same transaction as the flag/segment change so the marker commits atomically
 * with it - that atomicity is the whole guarantee. `organizations` carries no
 * RLS, so this write is valid inside any tenant transaction.
 */
export function markConfigDirty(tx: Tx, orgId: string) {
  return tx.execute(
    sql`UPDATE organizations SET config_pending_at = now() WHERE id = ${orgId}`,
  );
}

/**
 * Rebuild an org's artifact from the database, write it through to the store,
 * and record what was published - clearing the dirty marker only if it has not
 * advanced since we started (a newer change is left for the next publish/sweep,
 * so a concurrent mutation is never dropped). Returns null when no store is
 * configured. Throws if the store write fails after its retries, leaving the
 * marker set for the reconcile sweep.
 */
export async function publishConfig(
  orgId: string,
): Promise<PublishResult | null> {
  // Capture the marker before reading, so the clear below is conditional on
  // "nothing changed while we published".
  const [row] = await db
    .select({ pendingAt: organizations.configPendingAt })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const capturedPendingAt = row?.pendingAt ?? null;

  const result = await writeConfigArtifact(orgId);
  if (!result) return null;

  await db
    .update(organizations)
    .set({
      configVersion: result.version,
      configChecksum: result.checksum,
      configPublishedAt: new Date(),
      configPendingAt: sql`CASE
        WHEN ${organizations.configPendingAt} IS NOT DISTINCT FROM ${capturedPendingAt}
        THEN NULL ELSE ${organizations.configPendingAt} END`,
    })
    .where(eq(organizations.id, orgId));

  return result;
}

/**
 * Publish every org left marked dirty: the self-healing backstop for a
 * write-through that failed inline (or a process that died before it ran).
 * Bounded per run and ordered oldest-first so a backlog drains fairly. Idle
 * orgs cost nothing - the partial index means the driving query touches only
 * the handful with work outstanding.
 */
export async function reconcileDirtyConfigs(options?: {
  limit?: number;
}): Promise<{ dirty: number; healed: number; failed: number }> {
  if (!getConfigStore()) return { dirty: 0, healed: 0, failed: 0 };
  const limit = options?.limit ?? 100;
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNotNull(organizations.configPendingAt))
    .orderBy(asc(organizations.configPendingAt))
    .limit(limit);

  let healed = 0;
  let failed = 0;
  for (const org of orgs) {
    try {
      await publishConfig(org.id);
      healed += 1;
    } catch (error) {
      failed += 1;
      console.error(`config reconcile failed for org ${org.id}`, error);
    }
  }
  return { dirty: orgs.length, healed, failed };
}

/**
 * How many orgs are currently dirty, and how many have been dirty longer than
 * `staleAfterMs` (a healthy system has zero stale - anything else means the
 * store is diverging from the database and write-through is failing). Cheap
 * enough to expose on a health endpoint or alert on.
 */
export async function countDirtyConfigs(
  staleAfterMs = 5 * 60_000,
): Promise<{ total: number; stale: number }> {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      stale: sql<number>`count(*) FILTER (WHERE ${organizations.configPendingAt} < ${cutoff})::int`,
    })
    .from(organizations)
    .where(isNotNull(organizations.configPendingAt));
  return totals ?? { total: 0, stale: 0 };
}
