/**
 * Bundle compilation + publishing.
 *
 * compileBundle() reads an environment's flags and segments from Postgres and
 * produces the immutable, framework-free Bundle the evaluator consumes. Because
 * variants/targeting are already stored in the engine's shape, this is close to
 * a copy rather than a translation. publishEnvironment() compiles then writes to
 * the bundle store and records an audit entry.
 */

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Bundle, FlagDefinition } from '@/core/types';
import { withTenant } from '@/server/db';
import { newId } from '@/server/db/id';
import { auditLogs, environments, flagEnvironments, flags, segments } from '@/server/db/schema/app';
import { bundleStore } from '@/server/bundles';

/** Deterministic short etag from bundle content (stable across re-publishes). */
function computeEtag(flagsMap: Bundle['flags'], segmentsMap: Bundle['segments']): string {
  const canonical = JSON.stringify({ flags: flagsMap, segments: segmentsMap });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export async function compileBundle(
  organizationId: string,
  environmentId: string,
): Promise<Bundle> {
  return withTenant(organizationId, async (tx) => {
    const [env] = await tx
      .select({ projectId: environments.projectId })
      .from(environments)
      .where(eq(environments.id, environmentId))
      .limit(1);
    if (!env) throw new Error(`environment ${environmentId} not found`);

    const flagRows = await tx
      .select({
        key: flags.key,
        type: flags.type,
        state: flagEnvironments.state,
        defaultVariant: flagEnvironments.defaultVariant,
        variants: flagEnvironments.variants,
        targeting: flagEnvironments.targeting,
      })
      .from(flags)
      .innerJoin(
        flagEnvironments,
        and(
          eq(flagEnvironments.flagId, flags.id),
          eq(flagEnvironments.environmentId, environmentId),
        ),
      )
      .where(and(eq(flags.projectId, env.projectId), eq(flags.archived, false)));

    const segRows = await tx
      .select({ key: segments.key, condition: segments.condition })
      .from(segments)
      .where(eq(segments.projectId, env.projectId));

    const flagsMap: Record<string, FlagDefinition> = {};
    for (const row of flagRows) {
      flagsMap[row.key] = {
        state: row.state === 'ENABLED' ? 'ENABLED' : 'DISABLED',
        type: row.type,
        variants: row.variants,
        defaultVariant: row.defaultVariant,
        targeting: row.targeting,
      };
    }

    const segmentsMap: Bundle['segments'] = {};
    for (const row of segRows) {
      segmentsMap[row.key] = row.condition;
    }

    return {
      schemaVersion: 1,
      environmentId,
      etag: computeEtag(flagsMap, segmentsMap),
      generatedAt: new Date().toISOString(),
      flags: flagsMap,
      segments: segmentsMap,
    };
  });
}

export async function publishEnvironment(
  organizationId: string,
  environmentId: string,
  actorId?: string,
): Promise<Bundle> {
  const bundle = await compileBundle(organizationId, environmentId);
  await bundleStore().put({ organizationId, environmentId }, bundle);

  await withTenant(organizationId, async (tx) => {
    await tx.insert(auditLogs).values({
      id: newId('aud'),
      organizationId,
      actorId: actorId ?? null,
      actorType: actorId ? 'user' : 'system',
      action: 'environment.publish',
      targetType: 'environment',
      targetId: environmentId,
      metadata: { etag: bundle.etag, flagCount: Object.keys(bundle.flags).length },
    });
  });

  return bundle;
}
