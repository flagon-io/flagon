import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { auth } from "@/lib/auth";
import { pendingInvitations } from "@/lib/invitations";
import { resolveOrg } from "../resolve-org";
import {
  MembersPanel,
  type PanelInvitation,
  type PanelMember,
} from "./members-panel";

export const metadata: Metadata = { title: "Members" };

/** Member roster - `app.flagon.io/<org>/members`. Invite by username or
 * email; pending invitations listed until accepted, declined, or expired. */
export default async function MembersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const requestHeaders = await headers();
  const [org, session] = await Promise.all([
    resolveOrg(slug),
    auth.api.getSession({ headers: requestHeaders }),
  ]);
  if (!org || !session) notFound();

  const viewerRole = org.members.find(
    (m) => m.userId === session.user.id,
  )?.role;
  const canManage = viewerRole === "owner" || viewerRole === "admin";

  const userIds = org.members.map((member) => member.userId);
  const usernameRows = userIds.length
    ? await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  const usernames = new Map(usernameRows.map((row) => [row.id, row.username]));

  const members: PanelMember[] = org.members
    .map((member) => ({
      memberId: member.id,
      userId: member.userId,
      username: usernames.get(member.userId) ?? null,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const allInvitations = await auth.api.listInvitations({
    query: { organizationId: org.id },
    headers: requestHeaders,
  });
  const invitations: PanelInvitation[] = pendingInvitations(allInvitations).map(
    (invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role ?? "member",
      expiresAt: new Date(invitation.expiresAt).toISOString(),
    }),
  );

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        {org.name}
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Members
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {members.length} {members.length === 1 ? "member" : "members"}
        {invitations.length
          ? ` · ${invitations.length} pending ${
              invitations.length === 1 ? "invitation" : "invitations"
            }`
          : ""}
      </p>

      <div className="mt-8">
        <MembersPanel
          orgSlug={slug}
          viewerUserId={session.user.id}
          members={members}
          invitations={invitations}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
