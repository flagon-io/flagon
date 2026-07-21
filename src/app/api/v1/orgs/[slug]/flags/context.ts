import {
  isOrgAdmin,
  requireSession,
  resolveOrgAccess,
  type ApiActor,
} from "@/lib/api-auth.server";
import type { TokenScope } from "@/lib/access-tokens.server";

/**
 * Shared request context for the organization-scoped v1 routes.
 *
 * Accepts a session, a personal access token, or an organization token; see
 * src/lib/api-auth.server.ts for how authority differs between the three.
 * Every caller names the scope it needs, so a token is never trusted further
 * than it was issued for.
 */
export type FlagOrgContext = {
  org: { id: string; slug: string; name: string; plan: string };
  actor: ApiActor;
};

export async function resolveFlagOrg(
  request: Request,
  slug: string,
  scope: TokenScope,
): Promise<FlagOrgContext | { error: Response }> {
  const result = await resolveOrgAccess(request, slug, scope);
  if (!result.ok) return { error: result.error };
  return { org: result.access.org, actor: result.access.actor };
}

/**
 * Organization context for routes that MUST have a human behind them whatever
 * scopes exist: credential management above all. A token presenting itself
 * here is refused before anything else happens.
 */
export async function resolveSessionOrg(
  request: Request,
  slug: string,
): Promise<FlagOrgContext | { error: Response }> {
  const session = await requireSession(request);
  if (!session.ok) return { error: session.error };
  // No bearer token can be present at this point, so this resolves via the
  // session, for which the scope argument is never consulted.
  return resolveFlagOrg(request, slug, "org:read");
}

export { isOrgAdmin };
