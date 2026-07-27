import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listOrgTokens } from "@/lib/access-token";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { TokensManager } from "@/components/settings/tokens-manager";
import { createOrgTokenAction, revokeOrgTokenAction } from "./actions";

export const metadata: Metadata = {
  title: "Access tokens · Organization settings",
};

/**
 * Organization access tokens: shared credentials that act as the org itself, so
 * teams do not need to create service-account users. Owner/admin only.
 */
export default async function OrgTokensPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  if (!canManageOrg(membership.role)) {
    return (
      <div>
        <SettingsHeader title="Access tokens" />
        <SettingsSection title="Organization tokens">
          <p className="text-sm text-zinc-500">
            Only owners and admins can manage organization access tokens.
          </p>
        </SettingsSection>
      </div>
    );
  }

  const tokens = await listOrgTokens(membership.id);

  return (
    <div>
      <SettingsHeader
        title="Access tokens"
        description="Shared tokens that authenticate to the Flagon API as this organization."
      />
      <SettingsSection
        title="Organization tokens"
        description="Anyone with a token can act as the organization. Rotate and revoke them regularly."
      >
        <TokensManager
          tokens={tokens.map((t) => ({
            id: t.id,
            name: t.name,
            prefix: t.prefix,
            lastFour: t.lastFour,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
            expiresAt: t.expiresAt ? t.expiresAt.toISOString() : null,
          }))}
          createAction={createOrgTokenAction.bind(null, slug)}
          revokeAction={revokeOrgTokenAction.bind(null, slug)}
          scopeNote="Organization tokens act as the organization, independent of any single member."
        />
      </SettingsSection>
    </div>
  );
}
