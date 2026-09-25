import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOrgSecurity } from "@/lib/flagon-api";
import { getOrgContext, isOrgAdmin } from "@/lib/org-context";
import { listSSOProviders } from "@/lib/api/sso";
import { userHasSSOForOrg } from "@/lib/sso-admin";
import { OrgSecurityForm } from "@/components/orgs/org-security-form";
import { SSOProviders } from "@/components/orgs/sso-providers";

export default async function AuthenticationPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const { session, org, role } = await getOrgContext(slug);
  // Security settings are owners/admins only, like the audit log.
  if (!isOrgAdmin(role)) redirect(`/${slug}/settings`);

  // No fallbacks: defaulting the policy to "off" or the providers to "none" would
  // render a form that misstates the org's real security posture.
  // userHasSSOForOrg runs first because it re-syncs the org's providers with the
  // API, which also adopts any provider registered before the API owned SSO, so
  // the list below includes it.
  const viewerHasSSO = await userHasSSOForOrg(session.user.id, org.id);
  const [security, providers] = await Promise.all([getOrgSecurity(slug), listSSOProviders(slug)]);
  const viewerHasTwoFactor = Boolean(
    (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
  );
  const hdrs = await headers();
  const origin =
    process.env.BETTER_AUTH_URL ??
    `${hdrs.get("x-forwarded-proto") ?? "http"}://${hdrs.get("host") ?? "localhost:3000"}`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-6 py-8 lg:px-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Authentication</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Control how members of this organization sign in and secure their accounts.
        </p>
      </div>
      <OrgSecurityForm
        slug={slug}
        enforceTwoFactor={security.enforce_two_factor}
        requireSSO={security.require_sso}
        viewerHasTwoFactor={viewerHasTwoFactor}
        hasSSOProvider={providers.length > 0}
        viewerHasSSO={viewerHasSSO}
      />
      <SSOProviders slug={slug} origin={origin} initial={providers} />
    </div>
  );
}
