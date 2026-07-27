import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug, getOrgMembers } from "@/lib/org";
import { planAllowsInvites, planName } from "@/lib/plans";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { InviteMemberForm, MembersList } from "./members-manager";

export const metadata: Metadata = { title: "Members · Organization settings" };

export default async function OrgMembersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const members = await getOrgMembers(membership.id);
  const canManage = canManageOrg(membership.role);
  const allowsInvites = planAllowsInvites(membership.plan);

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        title="Members"
        description="People with access to this organization."
      />

      {canManage && allowsInvites ? (
        <SettingsSection
          title="Invite a member"
          description="They will get an email invitation to join this organization."
        >
          <InviteMemberForm organizationId={membership.id} />
        </SettingsSection>
      ) : canManage ? (
        <SettingsSection
          title="Invite a member"
          description={`${planName(membership.plan)} is limited to a single user.`}
        >
          <p className="text-sm text-zinc-400">
            Inviting teammates requires a paid plan. Upgrade this organization to
            add members, or self-host Flagon to run without a user limit.
          </p>
        </SettingsSection>
      ) : null}

      <SettingsSection title="Members" description={`${members.length} total`}>
        <MembersList
          organizationId={membership.id}
          currentUserId={session.user.id}
          canManage={canManage}
          members={members.map((m) => ({
            memberId: m.memberId,
            userId: m.userId,
            name: m.name,
            email: m.email,
            username: m.username,
            role: m.role,
          }))}
        />
      </SettingsSection>
    </div>
  );
}
