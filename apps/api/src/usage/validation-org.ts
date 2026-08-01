import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import {
  flagEvalRollups,
  usageCounters,
  usageEventRollups,
  usageEvents,
} from "../db/schema.js";

/**
 * The fixed organization that local validation + usage seeding run against.
 *
 * We validate the billing/usage feature against ONE stable, known org (default
 * slug "flagon") rather than a throwaway, so what we seed is exactly what we can
 * then eyeball in the browser. The automated unit/integration tests stay isolated
 * (they mint ephemeral orgs and clean up); this is a deliberate, separate hook
 * for hands-on validation and seeding. Override the slug with VALIDATION_ORG_SLUG.
 */
export const VALIDATION_ORG_SLUG = process.env.VALIDATION_ORG_SLUG ?? "flagon";

export type ValidationOrg = { id: string; slug: string; plan: string };

/**
 * Resolve the validation org, ASSERTING it exists. Throws a clear, actionable
 * error when it is missing so a seed or validation test fails loudly instead of
 * silently doing nothing against a non-existent org. Create it by signing up and
 * making an organization with this slug in the app.
 */
export async function resolveValidationOrg(): Promise<ValidationOrg> {
  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.slug, VALIDATION_ORG_SLUG));
  if (!org) {
    throw new Error(
      `Validation org "${VALIDATION_ORG_SLUG}" not found. Create an organization with that slug in the app first (or set VALIDATION_ORG_SLUG to an existing one).`,
    );
  }
  return org;
}

/**
 * Delete an org's usage rollups, the durable event receipts behind them, AND the
 * atomic monthly counter (free flag checks + billable events + the usage_events log
 * + org_usage_counters), returning it to a clean baseline. The receipts and counter
 * must go too: seeding re-ingests through the durable path (which increments the
 * counter), so leaving either would double-count on the next seed. Config — flags,
 * environments, keys — is left untouched. Runs inside withOrg so RLS scopes the
 * delete to this org.
 */
export async function scrubOrgUsage(orgId: string): Promise<void> {
  await withOrg(orgId, async (tx) => {
    await tx.delete(flagEvalRollups).where(eq(flagEvalRollups.organizationId, orgId));
    await tx.delete(usageEventRollups).where(eq(usageEventRollups.organizationId, orgId));
    await tx.delete(usageEvents).where(eq(usageEvents.organizationId, orgId));
    await tx.delete(usageCounters).where(eq(usageCounters.organizationId, orgId));
  });
}
