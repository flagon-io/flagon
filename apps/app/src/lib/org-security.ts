import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { orgSsoSessions, organizations, ssoProviders } from "@/db/schema";
import { APP_URL } from "@/lib/urls";

/**
 * Server-side helpers for an organization's security posture: SSO enforcement
 * and required 2FA (the GitHub model). `lib/roles.ts` covers who may MANAGE
 * these settings; this module answers whether a member is currently ALLOWED
 * into an org given its posture, and records SSO sessions.
 *
 * The one hard rule everywhere: the OWNER is never gated. An org can enforce SSO
 * or 2FA on everyone else, but the owner keeps a password path so a misconfigured
 * IdP (or a lost authenticator) can never lock an organization out of itself.
 */

/**
 * How long an established SSO session stays valid before the member must
 * re-authenticate against the IdP. GitHub defaults to ~24h (configurable up to
 * a week); we take the 24h default. Upserted by the SSO `provisionUser` hook.
 */
export const SSO_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type OrgSecurity = {
  ssoEnforced: boolean;
  require2fa: boolean;
  ssoDefaultRole: string;
  scimEnabled: boolean;
};

/** The security posture for an org, or null if the org does not exist. */
export async function getOrgSecurity(
  organizationId: string,
): Promise<OrgSecurity | null> {
  const rows = await db
    .select({
      ssoEnforced: organizations.ssoEnforced,
      require2fa: organizations.require2fa,
      ssoDefaultRole: organizations.ssoDefaultRole,
      scimEnabled: organizations.scimEnabled,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Whether the user holds an UNEXPIRED SSO session for this org. The enforcement
 * gate requires this for non-owner members of an `sso_enforced` org.
 */
export async function hasActiveSsoSession(
  organizationId: string,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: orgSsoSessions.id })
    .from(orgSsoSessions)
    .where(
      and(
        eq(orgSsoSessions.organizationId, organizationId),
        eq(orgSsoSessions.userId, userId),
        gt(orgSsoSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Record (or refresh) a user's SSO session for an org, valid for
 * SSO_SESSION_TTL_MS. Idempotent: one row per (org, user), upserted on each SSO
 * login. Called from the SSO `provisionUser` hook in lib/auth.ts.
 */
export async function stampSsoSession(
  organizationId: string,
  userId: string,
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SSO_SESSION_TTL_MS);
  await db
    .insert(orgSsoSessions)
    .values({ organizationId, userId, authenticatedAt: now, expiresAt })
    .onConflictDoUpdate({
      target: [orgSsoSessions.organizationId, orgSsoSessions.userId],
      set: { authenticatedAt: now, expiresAt },
    });
}

/**
 * The role to grant a member auto-provisioned into an org via SSO. BetterAuth's
 * organization provisioning only supports "member" | "admin", so read-only roles
 * (viewer/billing) are assigned manually or via SCIM, not SSO JIT. Honors the
 * org's `sso_default_role`; anything other than "admin" collapses to "member".
 */
export async function provisioningRoleFor(
  organizationId: string,
): Promise<"member" | "admin"> {
  const security = await getOrgSecurity(organizationId);
  return security?.ssoDefaultRole === "admin" ? "admin" : "member";
}

export type OrgSsoProvider = {
  providerId: string;
  issuer: string;
  domain: string;
  protocol: "saml" | "oidc";
};

/** The org's configured SSO provider, or null if none is linked yet. */
export async function getOrgSsoProvider(
  organizationId: string,
): Promise<OrgSsoProvider | null> {
  const rows = await db
    .select({
      providerId: ssoProviders.providerId,
      issuer: ssoProviders.issuer,
      domain: ssoProviders.domain,
      samlConfig: ssoProviders.samlConfig,
    })
    .from(ssoProviders)
    .where(eq(ssoProviders.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    providerId: row.providerId,
    issuer: row.issuer,
    domain: row.domain,
    protocol: row.samlConfig ? "saml" : "oidc",
  };
}

/**
 * The service-provider (Flagon) endpoints an admin pastes into their IdP when
 * wiring SAML: the Assertion Consumer Service (ACS) URL and the SP Entity ID.
 * Derived from the provider id and the app origin — stable, no DB round-trip.
 */
export function samlServiceProviderUrls(providerId: string) {
  const base = `${APP_URL.replace(/\/$/, "")}/api/auth/sso/saml2`;
  return {
    acsUrl: `${base}/sp/acs/${providerId}`,
    metadataUrl: `${base}/sp/metadata?providerId=${encodeURIComponent(providerId)}`,
    entityId: `${APP_URL.replace(/\/$/, "")}/api/auth/sso/saml2/sp/metadata`,
  };
}

// The pure gate predicates live in a DB-free module (like roles.ts) so they are
// unit-testable and client-safe. Re-exported here for existing server callers.
export { ssoBlocks, twoFactorBlocks } from "./org-security-predicates";
