// The auth layer's before-hook that keeps SSO on the API's configuration. Before
// any SSO endpoint runs (starting a sign-in, an OIDC callback, a SAML ACS/SLO or
// metadata request), the provider it is about to use is re-synced from the Go API
// into the plugin's provider table (lib/sso-sync.ts). A provider changed through
// the UI, REST API, agent or MCP therefore takes effect on the next sign-in, and
// one deleted there stops working. If the API can't answer, SSO fails closed.
import { APIError, createAuthMiddleware } from "better-auth/api";
import { SSOSyncError, syncSSOProviders, type SyncFilter } from "@/lib/sso-sync";

/**
 * The plugin's own provider-management endpoints. Providers are managed only
 * through the Flagon API, so these are switched off at the auth router (they
 * would otherwise write the cache directly, bypassing the API, scopes and audit).
 */
export const SSO_MANAGEMENT_PATHS = [
  "/sso/register",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/providers",
  "/sso/get-provider",
  "/sso/request-domain-verification",
  "/sso/verify-domain",
];

type HookContext = {
  path?: string;
  body?: unknown;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
};

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Which providers an auth request is about to use, or null for a non-SSO request. */
export function ssoSyncTarget(ctx: HookContext): SyncFilter | null {
  const path = ctx.path ?? "";
  if (path === "/sign-in/sso") {
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const providerId = text(body.providerId);
    if (providerId) return { providerId };
    const domain = text(body.domain) || text(body.email).split("@")[1] || "";
    return domain ? { domain: domain.toLowerCase() } : null;
  }
  if (!path.startsWith("/sso/")) return null;
  const providerId = text(ctx.params?.providerId) || text(ctx.query?.providerId);
  return providerId ? { providerId } : null;
}

export const ssoBeforeHook = createAuthMiddleware(async (ctx) => {
  const target = ssoSyncTarget(ctx as HookContext);
  if (!target) return;
  try {
    await syncSSOProviders(target);
  } catch (e) {
    console.error("[sso] could not sync providers from the API", e);
    if (e instanceof SSOSyncError) {
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Single sign-on is temporarily unavailable. Try again shortly.",
      });
    }
    throw e;
  }
});
