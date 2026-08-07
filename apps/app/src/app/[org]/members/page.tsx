import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  canManageOrg,
  getMembershipBySlug,
  getOrgInvitations,
  getOrgMembers,
} from "@/lib/org";
import { planAllowsInvites, planName } from "@/lib/plans";
import { MembersManager } from "./members-manager";

export const metadata: Metadata = { title: "Members" };

/**
 * Members ("People", GitHub-style): a top-level org area everyone can see. Any
 * member reads the roster; owners/admins invite, change roles, and remove. Managers
 * also get an Invitations tab (pending + expired invites) here rather than buried in
 * Settings. Inviting is an intentional action (a button that opens a dialog), not an
 * always-open form.
 */
export default async function OrgMembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { org: slug } = await params;
  const { tab } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const canManage = canManageOrg(membership.role);
  const [members, invitations] = await Promise.all([
    getOrgMembers(membership.id),
    // Invitations are manager-only; skip the call otherwise.
    canManage ? getOrgInvitations(membership.id) : Promise.resolve([]),
  ]);

  return (
    <MembersManager
      slug={membership.slug}
      organizationId={membership.id}
      currentUserId={session.user.id}
      canManage={canManage}
      allowsInvites={planAllowsInvites(membership.plan)}
      planLabel={planName(membership.plan)}
      initialTab={tab === "invitations" ? "invitations" : "members"}
      members={members.map((m) => ({
        memberId: m.memberId,
        userId: m.userId,
        name: m.name,
        email: m.email,
        username: m.username,
        role: m.role,
      }))}
      invitations={invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role ?? "member",
        status: i.status,
        expiresAt: i.expiresAt.toISOString(),
      }))}
    />
  );
}
