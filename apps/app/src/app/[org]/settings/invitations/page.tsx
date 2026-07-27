import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  canManageOrg,
  getMembershipBySlug,
  getOrgInvitations,
} from "@/lib/org";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { InvitationsList } from "./invitations-list";

export const metadata: Metadata = {
  title: "Invitations · Organization settings",
};

export default async function OrgInvitationsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const invites = await getOrgInvitations(membership.id);
  const canManage = canManageOrg(membership.role);

  return (
    <div>
      <SettingsHeader
        title="Invitations"
        description="People invited to this organization who have not joined yet."
      />
      <SettingsSection
        title="Pending invitations"
        description={`${invites.length} pending`}
      >
        {invites.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No pending invitations. Invite teammates from the Members tab.
          </p>
        ) : (
          <InvitationsList
            canManage={canManage}
            invitations={invites.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.role ?? "member",
              expiresAt: i.expiresAt.toISOString(),
            }))}
          />
        )}
      </SettingsSection>
    </div>
  );
}
