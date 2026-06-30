/**
 * POST /api/v1/orgs/{org}/environments/{envId}/publish
 *
 * Compiles the environment's flags into a bundle and writes it to the bundle
 * store, making the change live for SDKs. The org is in the path so we can
 * establish tenant context before touching any RLS-protected row.
 */

import { eq } from 'drizzle-orm';
import { withTenant } from '@/server/db';
import { environments } from '@/server/db/schema/app';
import { publishEnvironment } from '@/server/flags/publish';
import { apiError, isResponse, json, requireMembership } from '@/server/api/http';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ org: string; envId: string }> },
) {
  const { org, envId } = await ctx.params;
  const membership = await requireMembership(req, org, 'member');
  if (isResponse(membership)) return membership;

  // RLS guarantees this only resolves if the env belongs to the member's org.
  const [env] = await withTenant(membership.organizationId, (tx) =>
    tx.select({ id: environments.id }).from(environments).where(eq(environments.id, envId)).limit(1),
  );
  if (!env) return apiError(404, 'Environment not found.');

  const bundle = await publishEnvironment(membership.organizationId, envId, membership.user.id);

  return json({
    published: true,
    etag: bundle.etag,
    flagCount: Object.keys(bundle.flags).length,
    generatedAt: bundle.generatedAt,
  });
}
