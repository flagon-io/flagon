/**
 * Postgres bundle store - the default driver. Great for local dev and
 * self-host (no extra infrastructure), and the durable source of truth even
 * when R2 is the edge read path. Bundles are append-only history keyed by etag;
 * reads return the most recently generated row for the environment.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { Bundle } from '@/core/types';
import { withTenant } from '@/server/db';
import { bundles } from '@/server/db/schema/app';
import type { BundleRef, BundleStore } from './store';

export class PostgresBundleStore implements BundleStore {
  async put(ref: BundleRef, bundle: Bundle): Promise<void> {
    await withTenant(ref.organizationId, async (tx) => {
      await tx
        .insert(bundles)
        .values({
          organizationId: ref.organizationId,
          environmentId: ref.environmentId,
          etag: bundle.etag,
          payload: bundle,
        })
        // Same content (same etag) re-published is a no-op.
        .onConflictDoNothing({ target: [bundles.environmentId, bundles.etag] });
    });
  }

  async get(ref: BundleRef): Promise<Bundle | null> {
    return withTenant(ref.organizationId, async (tx) => {
      const rows = await tx
        .select({ payload: bundles.payload })
        .from(bundles)
        // RLS (FORCE, gated on app.current_org via withTenant) already scopes this
        // to the org; the explicit organizationId predicate is defense-in-depth so
        // a bundle is never readable cross-org even if a policy were ever relaxed.
        .where(and(eq(bundles.environmentId, ref.environmentId), eq(bundles.organizationId, ref.organizationId)))
        .orderBy(desc(bundles.generatedAt))
        .limit(1);
      return rows[0]?.payload ?? null;
    });
  }
}
