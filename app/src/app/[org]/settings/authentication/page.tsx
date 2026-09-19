import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getOrgSecurity, type OrgSecurity } from "@/lib/flagon-api";
import { listOrgProviders, userHasSSOForOrg } from "@/lib/sso-admin";
import { OrgSecurityForm } from "@/components/orgs/org-security-form";
import { SSOProviders } from "@/components/orgs/sso-providers";

export default async function AuthenticationPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const [me, session] = await Promise.all([
    getMe().catch(() => null),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!session || !me) redirect("/login");
  const org = me.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/");
  // Security settings are owners/admins only, like the audit log.
  if (org.role !== "owner" && org.role !== "admin") redirect(`/${slug}/settings`);

  const [security, providers] = await Promise.all([
    getOrgSecurity(slug).catch(
      () => ({ enforce_two_factor: false, require_sso: false, base_permission: "read" }) as OrgSecurity,
    ),
    listOrgProviders(org.id).catch(() => []),
  ]);
  const viewerHasTwoFactor = Boolean(
    (session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled,
  );
  const viewerHasSSO = await userHasSSOForOrg(session.user.id, org.id).catch(() => false);
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
