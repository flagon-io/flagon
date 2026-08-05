import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, scimTokens } from "@/db/schema";
import { hashToken } from "@/lib/token-hash";

/**
 * SCIM bearer-token AUTHENTICATION (the app hosts the SCIM endpoints). Tokens are
 * minted/listed/revoked by the API (/v1/orgs/:org/security/scim-tokens) so the
 * management surface stays API-first; this module only verifies a presented
 * token on the SCIM request path. Both sides hash identically (sha256, see
 * lib/token-hash), so a token minted by the API resolves here.
 */

const PREFIX = "flagon_scim";

/**
 * Resolve a presented SCIM bearer token to its org, or null. The org's
 * `scim_enabled` switch must be on, the token unrevoked and unexpired. Best-
 * effort stamps last_used_at.
 */
export async function authenticateScimToken(
  token: string,
): Promise<{ organizationId: string } | null> {
  if (!token.startsWith(`${PREFIX}_`)) return null;
  const rows = await db
    .select({
      id: scimTokens.id,
      organizationId: scimTokens.organizationId,
      expiresAt: scimTokens.expiresAt,
      revokedAt: scimTokens.revokedAt,
      scimEnabled: organizations.scimEnabled,
      plan: organizations.plan,
    })
    .from(scimTokens)
    .innerJoin(organizations, eq(scimTokens.organizationId, organizations.id))
    .where(eq(scimTokens.tokenHash, hashToken(token)))
    .limit(1);
  const t = rows[0];
  if (!t) return null;
  if (t.revokedAt) return null;
  if (!t.scimEnabled) return null;
  // SCIM is a paid capability; a token can't provision on a downgraded org even
  // if `scim_enabled` was somehow left on. The API gates enablement too.
  if (t.plan === "hobby") return null;
  if (t.expiresAt && t.expiresAt.getTime() < Date.now()) return null;

  void db
    .update(scimTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(scimTokens.id, t.id))
    .catch(() => {});

  return { organizationId: t.organizationId };
}

/** Extract + authenticate the SCIM bearer from a request. */
export async function authenticateScimRequest(
  req: Request,
): Promise<{ organizationId: string } | null> {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authenticateScimToken(authorization.slice(7).trim());
}
