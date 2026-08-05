import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import {
  getOrgSsoProvider,
  samlServiceProviderUrls,
} from "@/lib/org-security";
import { getSecurityPosture, listScimTokens } from "@/lib/security-api";
import { APP_URL } from "@/lib/urls";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { TwoFactorSection } from "./two-factor-section";
import { SsoSection } from "./sso-section";
import { ScimSection } from "./scim-section";

export const metadata: Metadata = {
  title: "Authentication security · Organization settings",
};

export default async function OrgSecuritySettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const canManage = canManageOrg(membership.role);
  // Arming enforcement (require SSO / require 2FA) is owner-only (mirrors the
  // API), so a non-owner admin can never lock themselves out.
  const isOwner = membership.role === "owner";

  // Pro+ only (Statsig/Okta-style enterprise lever). Hobby sees an upsell.
  if (membership.plan === "hobby") {
    return (
      <div className="flex flex-col gap-6">
        <SettingsHeader
          title="Authentication security"
          description="Single sign-on, SCIM provisioning, and two-factor enforcement for your organization."
        />
        <SettingsSection title="Available on paid plans">
          <div className="flex flex-col items-start gap-4 py-2">
            <div className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <ShieldCheck className="size-5 text-teal-300" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-zinc-100">
                SAML/OIDC single sign-on, SCIM provisioning, and required 2FA
              </p>
              <p className="max-w-prose text-xs text-zinc-500">
                Connect your identity provider, provision members automatically,
                and enforce SSO or two-factor across the organization. Available
                on Pro and Enterprise.
              </p>
            </div>
            {canManage ? (
              <Link
                href={`/${slug}/settings/billing`}
                className="inline-flex items-center rounded-md border border-white/12 bg-white/5 px-3.5 py-2 text-sm font-medium text-zinc-100 transition hover:border-white/25"
              >
                Upgrade to Pro
              </Link>
            ) : (
              <p className="text-xs text-zinc-500">
                Ask an owner or admin to upgrade this organization.
              </p>
            )}
          </div>
        </SettingsSection>
      </div>
    );
  }

  const providerId = `sso-${membership.id}`;
  const [posture, provider, scimTokens] = await Promise.all([
    getSecurityPosture(slug),
    getOrgSsoProvider(membership.id),
    listScimTokens(slug),
  ]);
  const spUrls = samlServiceProviderUrls(providerId);
  const scimBaseUrl = `${APP_URL.replace(/\/$/, "")}/api/scim/v2`;

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Authentication security"
        description="Single sign-on, SCIM provisioning, and two-factor enforcement for your organization."
      />

      <SettingsSection
        title="Two-factor authentication"
        description="Add a second layer of security for everyone in the organization."
      >
        <TwoFactorSection
          slug={slug}
          orgName={membership.name}
          isOwner={isOwner}
          require2fa={posture?.require2fa ?? false}
        />
      </SettingsSection>

      <SettingsSection
        title="Single sign-on"
        description="Connect an identity provider like Okta, Azure AD, OneLogin, or any SAML 2.0 / OIDC provider. Configure and test before you enforce."
      >
        <SsoSection
          slug={slug}
          orgId={membership.id}
          orgName={membership.name}
          canManage={canManage}
          isOwner={isOwner}
          provider={provider}
          ssoEnforced={posture?.ssoEnforced ?? false}
          providerId={providerId}
          callbackUrl={APP_URL}
          spUrls={spUrls}
        />
      </SettingsSection>

      <SettingsSection
        title="SCIM provisioning"
        description="Automatically provision and deprovision members from your identity provider."
      >
        <ScimSection
          slug={slug}
          canManage={canManage}
          scimEnabled={posture?.scimEnabled ?? false}
          scimBaseUrl={scimBaseUrl}
          tokens={scimTokens}
        />
      </SettingsSection>
    </div>
  );
}
