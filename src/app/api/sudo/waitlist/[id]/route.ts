/**
 * PATCH /api/sudo/waitlist/{id} - platform admin. Approve or reject an entry.
 * Internal admin API (not part of the product surface).
 */

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db';
import { waitlist } from '@/server/db/schema/app';
import { apiError, isResponse, json } from '@/server/api/http';
import { requireSudoAccess } from '@/server/api/admin';
import { sendWaitlistApproved } from '@/server/email/send';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ action: z.enum(['approve', 'reject']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireSudoAccess(req);
  if (isResponse(admin)) return admin;

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(422, 'The action must be "approve" or "reject".');

  const status = parsed.data.action === 'approve' ? 'approved' : 'rejected';
  const [updated] = await db
    .update(waitlist)
    .set({
      status,
      approvedByUserId: admin.id,
      approvedAt: parsed.data.action === 'approve' ? new Date() : null,
    })
    .where(eq(waitlist.id, id))
    .returning({ id: waitlist.id, email: waitlist.email, status: waitlist.status });

  if (!updated) return apiError(404, 'Waitlist entry not found.');
  if (parsed.data.action === 'approve') await sendWaitlistApproved(updated.email);
  return json({ entry: updated });
}
