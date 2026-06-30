/**
 * Sudo access gate. The "sudo" console and /api/sudo are reserved for members of
 * the sudo organization (slug = SUDO_ORG_SLUG, default "flagon") — Flagon's own
 * team. They can switch between the normal product UI (dogfooding their own
 * flags) and the admin console; nobody else sees that it exists.
 *
 * FLAGON_ADMIN_EMAIL is honored as a bootstrap fallback so a brand-new instance
 * can reach the console before the sudo org has been created.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { members, organizations } from '@/server/db/schema/auth';
import { SUDO_ORG_SLUG } from '@/server/config';
import { apiError, getUser, type SessionUser } from './http';

/** Is the user a member of the sudo organization? */
export async function isSudoMember(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: members.id })
    .from(members)
    .innerJoin(organizations, eq(members.organizationId, organizations.id))
    .where(and(eq(organizations.slug, SUDO_ORG_SLUG), eq(members.userId, userId)))
    .limit(1);
  return Boolean(row);
}

/** Sudo access = sudo-org membership, or the bootstrap admin email. */
export async function hasSudoAccess(user: SessionUser): Promise<boolean> {
  const bootstrap = process.env.FLAGON_ADMIN_EMAIL?.toLowerCase();
  if (bootstrap && user.email.toLowerCase() === bootstrap) return true;
  return isSudoMember(user.id);
}

/** Resolve a signed-in sudo member, or a ready-to-return error Response. */
export async function requireSudoAccess(req: Request): Promise<SessionUser | Response> {
  const user = await getUser(req);
  if (!user) return apiError(401, 'Unauthenticated.');
  if (!(await hasSudoAccess(user))) {
    return apiError(403, 'This action requires the sudo organization.');
  }
  return user;
}
