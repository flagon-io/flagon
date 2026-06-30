/**
 * GET /api/v1/me - the signed-in user and the organizations they belong to.
 * Every user has at least one org (guaranteed at signup).
 */

import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { members, organizations } from '@/server/db/schema/auth';
import { apiError, getUser, json } from '@/server/api/http';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return apiError(401, 'Unauthenticated.');

  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      role: members.role,
    })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(eq(members.userId, user.id));

  return json({ user, organizations: orgs });
}
