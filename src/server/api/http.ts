/**
 * Shared helpers for the /api/v1 management surface.
 *
 * Response conventions (the Flagon API standard):
 *   - JSON only. Success responses return the resource directly - there is no
 *     envelope, no top-level `data` wrapper.
 *   - Errors are `{ "message": string }`, plus `{ "errors": { field: string[] } }`
 *     for validation (422). Unknown routes 404 as JSON (see app/api/[...slug]).
 *
 * Authentication is unified behind `getPrincipal`: a request may carry a session
 * cookie, a user PAT (`flagon_pat_…`), an org token (`flagon_oat_…`), or a
 * pre-exchanged Bearer JWT. All four normalize to one `Principal`; the JWT path is
 * validated by `verifyJwt` (JWKS only) — exactly what a split-out API would use.
 */

import { and, eq } from 'drizzle-orm';
import type { ZodError } from 'zod';
import { auth } from '@/server/auth';
import { db } from '@/server/db';
import { members, organizations } from '@/server/db/schema/auth';
import { bearerFromHeader } from '@/server/flags/sdk-keys';
import { isApiTokenFormat, resolveApiToken } from '@/server/tokens/api-tokens';
import { verifyJwt } from '@/server/auth/jwt';
import { claimsToPrincipal, type Principal } from '@/server/auth/principal';
import { principalRateLimit } from './rate-limit';
import { scopeAllows, type ApiScope } from './scopes';

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

/** Resolve the signed-in user from a request's session cookie, or null. */
export async function getUser(req: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/**
 * Resolve the principal behind a request from any supported credential, or null.
 * Order: Authorization bearer (API token, then JWT), else the session cookie.
 */
export async function getPrincipal(req: Request): Promise<Principal | null> {
  const bearer = bearerFromHeader(req.headers.get('authorization'));
  if (bearer) {
    if (isApiTokenFormat(bearer)) {
      const t = await resolveApiToken(bearer);
      if (!t) return null;
      if (t.kind === 'org') {
        return {
          actor: 'org',
          via: 'org-token',
          tokenId: t.id,
          organizationId: t.organizationId ?? undefined,
          role: t.role ?? undefined,
          scopes: t.scopes,
        };
      }
      return { actor: 'user', via: 'pat', userId: t.userId ?? undefined, tokenId: t.id, scopes: t.scopes };
    }
    // Not one of our tokens — treat a 3-segment value as a JWT, verify via JWKS.
    if (bearer.split('.').length === 3) {
      const claims = await verifyJwt(bearer);
      return claims ? claimsToPrincipal(claims) : null;
    }
    return null;
  }

  const session = await auth.api.getSession({ headers: req.headers });
  if (session?.user) return { actor: 'user', via: 'session', userId: session.user.id };
  return null;
}

/**
 * Resolve the principal and apply per-token rate limiting. Returns the principal,
 * a 401 if unauthenticated, or a 429 if a token is over budget. Use this in any
 * endpoint that doesn't go through requireMembership (e.g. /me, /token).
 */
export async function authenticatedPrincipal(req: Request): Promise<Principal | Response> {
  const principal = await getPrincipal(req);
  if (!principal) return apiError(401, 'Unauthenticated.');
  const limited = principalRateLimit(principal);
  if (limited) return limited;
  return principal;
}

const ROLE_RANK: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export interface OrgMembership {
  principal: Principal;
  organizationId: string;
  role: string;
}

/**
 * Resolve the principal's role in an org (addressed by slug or id) and assert a
 * minimum role. Returns the membership or a ready-to-return error Response.
 *
 * Where the role comes from depends on how the request authenticated:
 *   - session / user PAT → the user's LIVE membership (revoking access takes effect now)
 *   - org token          → its bound org + assigned role
 *   - JWT                → the trusted `orgs` claim (no DB lookup — the seam contract)
 */
export async function requireMembership(
  req: Request,
  orgRef: string,
  minRole: 'viewer' | 'member' | 'admin' | 'owner' = 'member',
  scope?: ApiScope,
): Promise<OrgMembership | Response> {
  const principal = await authenticatedPrincipal(req);
  if (isResponse(principal)) return principal;

  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, orgRef))
    .limit(1);
  const organizationId = org?.id ?? orgRef;

  let role: string | undefined;
  if (principal.via === 'jwt') {
    role =
      principal.actor === 'org'
        ? principal.organizationId === organizationId
          ? principal.role
          : undefined
        : principal.orgs?.[organizationId];
  } else if (principal.via === 'org-token') {
    role = principal.organizationId === organizationId ? principal.role : undefined;
  } else {
    // session or user PAT → live membership lookup
    const [membership] = await db
      .select({ role: members.role })
      .from(members)
      .where(and(eq(members.organizationId, organizationId), eq(members.userId, principal.userId!)))
      .limit(1);
    role = membership?.role;
  }

  if (!role) return apiError(403, 'You are not a member of this organization.');
  if ((ROLE_RANK[role] ?? 0) < ROLE_RANK[minRole]!) {
    return apiError(403, `This action requires the ${minRole} role.`);
  }
  // Fine-grained scope check (a scoped token must carry the endpoint's scope).
  if (scope && !scopeAllows(principal.scopes, scope)) {
    return apiError(403, `This token is missing the "${scope}" scope.`);
  }
  return { principal, organizationId, role };
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}
