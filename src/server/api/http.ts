/**
 * Shared helpers for the /api/v1 management surface.
 *
 * Response conventions (the Flagon API standard):
 *   - JSON only. Success responses return the resource directly - there is no
 *     envelope, no top-level `data` wrapper.
 *   - Errors are `{ "message": string }`, plus `{ "errors": { field: string[] } }`
 *     for validation (422). Unknown routes 404 as JSON (see app/api/[...slug]).
 *
 * Management endpoints authenticate with the user's BetterAuth session (cookies),
 * distinct from the SDK-key auth used by the OFREP evaluation surface.
 */

import { and, eq } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { members, organizations } from '@/server/db/schema/auth';

export function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers ?? {}) },
  });
}

/** Standard error response: `{ message }` (+ optional `errors`). */
export function apiError(
  status: number,
  message: string,
  errors?: Record<string, string[]>,
): Response {
  return json(errors ? { message, errors } : { message }, { status });
}

/** Map a Zod error onto a 422 with a per-field `errors` object. */
export function validationError(error: ZodError): Response {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (errors[key] ??= []).push(issue.message);
  }
  return apiError(422, 'The given data was invalid.', errors);
}

/**
 * Public base URL for self-documenting API links. On the api.* subdomain the
 * proxy strips the /api prefix; elsewhere endpoints live under /api.
 */
export function apiBaseUrl(req: Request): string {
  const h = req.headers;
  const proto = h.get('x-forwarded-proto') ?? (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  const host = h.get('host') ?? 'localhost:3000';
  return host.startsWith('api.') ? `${proto}://${host}` : `${proto}://${host}/api`;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Resolve the signed-in user from a request, or null. */
export async function getUser(req: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export interface OrgMembership {
  user: SessionUser;
  organizationId: string;
  role: string;
}

/**
 * Resolve a user's membership in an org (addressed by slug or id) and assert a
 * minimum role. Returns the membership or a ready-to-return error Response.
 */
export async function requireMembership(
  req: Request,
  orgRef: string,
  minRole: 'viewer' | 'member' | 'admin' | 'owner' = 'member',
): Promise<OrgMembership | Response> {
  const user = await getUser(req);
  if (!user) return apiError(401, 'Unauthenticated.');

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgRef))
    .limit(1);
  const organizationId = org?.id ?? orgRef;

  const [membership] = await db
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.organizationId, organizationId), eq(members.userId, user.id)))
    .limit(1);

  if (!membership) return apiError(403, 'You are not a member of this organization.');
  if ((ROLE_RANK[membership.role] ?? 0) < ROLE_RANK[minRole]!) {
    return apiError(403, `This action requires the ${minRole} role.`);
  }
  return { user, organizationId, role: membership.role };
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
