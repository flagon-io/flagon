import type { TenantTx } from "../db/tenant.js";
import { environments } from "../db/schema.js";

/**
 * The environments every org starts with, mirroring the deployment stages a
 * team ships through. Seeded lazily (idempotently) the first time an org touches
 * flags, so there is no separate provisioning step.
 */
export const DEFAULT_ENVIRONMENTS = [
  { key: "production", name: "Production", sortOrder: 0 },
  { key: "preview", name: "Preview", sortOrder: 1 },
  { key: "development", name: "Development", sortOrder: 2 },
] as const;

/**
 * Ensure the org has its default environments, then return all of them sorted.
 * Idempotent: the unique (org, key) index turns re-seeding into a no-op. MUST
 * run inside withOrg() — the insert's organization_id has to match the current
 * org context or RLS's WITH CHECK rejects it.
 */
export async function ensureEnvironments(tx: TenantTx, organizationId: string) {
  await tx
    .insert(environments)
    .values(DEFAULT_ENVIRONMENTS.map((e) => ({ ...e, organizationId })))
    .onConflictDoNothing({
      target: [environments.organizationId, environments.key],
    });

  return tx
    .select()
    .from(environments)
    .orderBy(environments.sortOrder);
}
