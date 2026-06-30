/**
 * GET /api/sudo/waitlist - platform admin. List waitlist entries.
 *
 * The /api/sudo/* surface is the internal admin API for the "sudo" console - it
 * is NOT part of the product API (no OpenAPI, not advertised in /api/v1).
 */

import { desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { waitlist } from '@/server/db/schema/app';
import { isResponse, json } from '@/server/api/http';
import { requireSudoAccess } from '@/server/api/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const admin = await requireSudoAccess(req);
  if (isResponse(admin)) return admin;

  const entries = await db
    .select({
      id: waitlist.id,
      email: waitlist.email,
      name: waitlist.name,
      status: waitlist.status,
      createdAt: waitlist.createdAt,
      approvedAt: waitlist.approvedAt,
    })
    .from(waitlist)
    .orderBy(desc(waitlist.createdAt));

  return json({ entries });
}
