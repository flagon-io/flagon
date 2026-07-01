/**
 * Default environments every new org starts with. Environments are an org-level
 * platform primitive (shared across all projects), so they're seeded once when an
 * organization is created — see the org-creation hook in `@/server/auth`.
 */

import { withTenant } from '@/server/db';
import { uuidv7 } from '@/server/db/id';
import { environments } from '@/server/db/schema/app';

export const DEFAULT_ENVIRONMENTS = [
  { name: 'Production', key: 'production', color: '#22c55e', tier: 'production', rank: 30 },
  { name: 'Staging', key: 'staging', color: '#f59e0b', tier: 'staging', rank: 20 },
] as const;

/** Seed the default environment set for a freshly created org (idempotent). */
export async function seedDefaultEnvironments(organizationId: string): Promise<void> {
  await withTenant(organizationId, (tx) =>
    tx
      .insert(environments)
      .values(
        DEFAULT_ENVIRONMENTS.map((e) => ({
          id: uuidv7(),
          organizationId,
          name: e.name,
          key: e.key,
          color: e.color,
          tier: e.tier,
          rank: e.rank,
        })),
      )
      // A default key already present (e.g. re-run) is a no-op.
      .onConflictDoNothing({ target: [environments.organizationId, environments.key] }),
  );
}
