/**
 * PATCH /api/sudo/requests/{id} — platform admin. Move a building-block request
 * through the triage pipeline (new → reviewing → planned → shipped / declined).
 * Internal admin API (not part of the product surface).
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { featureRequests } from '@/server/db/schema/app';
import { apiError, isResponse, json } from '@/server/api/http';
import { requireSudoAccess } from '@/server/api/admin';

export const dynamic = 'force-dynamic';

export const REQUEST_STATUSES = ['new', 'reviewing', 'planned', 'shipped', 'declined'] as const;

const patchSchema = z.object({ status: z.enum(REQUEST_STATUSES) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSudoAccess(req);
  if (isResponse(admin)) return admin;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(422, `Status must be one of: ${REQUEST_STATUSES.join(', ')}.`);

  const [updated] = await db
    .update(featureRequests)
    .set({ status: parsed.data.status })
    .where(eq(featureRequests.id, id))
    .returning({ id: featureRequests.id, status: featureRequests.status });

  if (!updated) return apiError(404, 'Request not found.');
  return json({ request: updated });
}
