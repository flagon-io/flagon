// Server-only SSO helpers for the org gate and the "SSO required" page. Provider
// CONFIGURATION is owned by the Flagon API (managed via lib/api/sso.ts from the
// settings UI, or the REST API / agent / MCP); these helpers only read the auth
// layer's provider cache, re-syncing it from the API first so a provider removed
// through any front door is never honored here.
import { pool } from "@/lib/db";
import { syncSSOProviders } from "@/lib/sso-sync";

/**
 * True when the user has an SSO account linked to one of this org's LIVE
 * providers - i.e. they have signed in through the org's IdP. Used for BOTH the
 * require-SSO gate (block members who haven't) and the settings lockout safety (an
 * admin can only turn the requirement on once their own SSO is linked). The auth
 * layer stores an SSO login as an `accounts` row whose providerId is the SSO
 * provider's id; the provider list comes from the API.
 */
export async function userHasSSOForOrg(userId: string, orgId: string): Promise<boolean> {
  const providers = await syncSSOProviders({ orgId });
  if (providers.length === 0) return false;
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM accounts WHERE "userId" = $1 AND "providerId" = ANY($2::text[])
     ) AS ok`,
    [userId, providers.map((p) => p.provider_id)],
  );
  return Boolean(rows[0]?.ok);
}

/**
 * The provider ids an org's members can sign in through (for the "SSO required"
 * page, which non-admin members see, so it can't use the admin-only list).
 */
export async function orgProviderIds(orgId: string): Promise<string[]> {
  const providers = await syncSSOProviders({ orgId });
  return providers.map((p) => p.provider_id);
}
