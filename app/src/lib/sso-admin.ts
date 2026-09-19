// Server-only helpers for managing an organization's SSO providers. Registration
// goes through BetterAuth's SSO plugin (auth.api), which owns the provider registry
// + all the OIDC/SAML crypto; listing/removal read the auth DB directly. Callers
// MUST first verify the current user is an owner/admin of the Flagon org (the
// plugin's own org gate targets BetterAuth orgs, which we don't use).
import { headers } from "next/headers";
import { pool } from "@/lib/db";
import { auth } from "@/lib/auth";

export interface SSOProviderRow {
  id: string;
  providerId: string;
  issuer: string;
  domain: string | null;
  protocol: "oidc" | "saml";
}

/**
 * True when the user has an SSO account linked to one of this org's providers -
 * i.e. they have signed in through the org's IdP. Used for BOTH the require-SSO
 * gate (block members who haven't) and the settings lockout safety (an admin can
 * only turn the requirement on once their own SSO is linked). BetterAuth stores an
 * SSO login as an `accounts` row whose providerId is the SSO provider's id.
 */
export async function userHasSSOForOrg(userId: string, orgId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM accounts a
       JOIN sso_providers s ON s."providerId" = a."providerId"
       WHERE a."userId" = $1 AND s."organizationId" = $2
     ) AS ok`,
    [userId, orgId],
  );
  return Boolean(rows[0]?.ok);
}

/** The SSO providers bound to a Flagon org (safe fields only - never the secrets). */
export async function listOrgProviders(orgId: string): Promise<SSOProviderRow[]> {
  const { rows } = await pool.query(
    `SELECT id, "providerId", issuer, domain,
            CASE WHEN "samlConfig" IS NOT NULL THEN 'saml' ELSE 'oidc' END AS protocol
       FROM sso_providers WHERE "organizationId" = $1 ORDER BY "providerId"`,
    [orgId],
  );
  return rows as SSOProviderRow[];
}

export interface OidcInput {
  protocol: "oidc";
  providerId: string;
  issuer: string;
  domain: string;
  clientId: string;
  clientSecret: string;
}

export interface SamlInput {
  protocol: "saml";
  providerId: string;
  issuer: string;
  domain: string;
  entryPoint: string;
  cert: string;
}

export type RegisterProviderInput = OidcInput | SamlInput;

/**
 * Register an SSO provider for a Flagon org via the BetterAuth SSO plugin. The
 * organizationId links the provider to the org so a login through it provisions
 * membership there (see provisionUser in lib/auth.ts).
 */
export async function registerProvider(orgId: string, input: RegisterProviderInput) {
  const base = {
    providerId: input.providerId,
    issuer: input.issuer,
    domain: input.domain,
    organizationId: orgId,
  };
  const body =
    input.protocol === "oidc"
      ? { ...base, oidcConfig: { clientId: input.clientId, clientSecret: input.clientSecret } }
      : { ...base, samlConfig: { entryPoint: input.entryPoint, cert: input.cert, issuer: input.issuer } };
  // The plugin's body is intentionally permissive; cast through unknown.
  return auth.api.registerSSOProvider({
    body: body as unknown as Record<string, never>,
    headers: await headers(),
  });
}

/** Remove an org's SSO provider (by providerId), scoped to the org for safety. */
export async function deleteProvider(orgId: string, providerId: string): Promise<void> {
  await pool.query(`DELETE FROM sso_providers WHERE "organizationId" = $1 AND "providerId" = $2`, [
    orgId,
    providerId,
  ]);
}
