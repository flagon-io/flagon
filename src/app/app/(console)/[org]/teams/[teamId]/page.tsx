import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { Package } from "lucide-react";
import { auth } from "@/lib/auth";
import { listTeamProjectGrants } from "@/lib/project-access.server";
import { listTeamRoster } from "@/lib/teams.server";
import { resolveOrg } from "../../resolve-org";
import {
  TeamPanel,
  type AddableMember,
  type TeamPanelMember,
} from "./team-panel";

type Params = { params: Promise<{ org: string; teamId: string }> };

export const metadata: Metadata = { title: "Team" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * Team page - `app.flagon.io/<org>/teams/<id>`: the roster, adding and
 * removing members (owners/admins), and the danger zone.
 */
export default async function TeamPage({ params }: Params) {
  const { org: orgSlug, teamId } = await params;
  const requestHeaders = await headers();
  const [org, session] = await Promise.all([
    resolveOrg(orgSlug),
    auth.api.getSession({ headers: requestHeaders }),
  ]);
  if (!org || !session) notFound();

  // Scope check: the team must belong to this organization.
  const teams = await auth.api.listOrganizationTeams({
    query: { organizationId: org.id },
    headers: requestHeaders,
  });
  const team = teams.find((t) => t.id === teamId);
  if (!team) notFound();

  const viewerRole = org.members.find(
    (m) => m.userId === session.user.id,
  )?.role;
  const canManage = viewerRole === "owner" || viewerRole === "admin";

  const [teamMemberRows, projectGrants] = await Promise.all([
    listTeamRoster(team.id),
    listTeamProjectGrants(org.id, team.id),
  ]);
  const memberUserIds = teamMemberRows.map((row) => row.userId);
  const userRows = memberUserIds.length
    ? await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(inArray(users.id, memberUserIds))
    : [];
  const usersById = new Map(userRows.map((row) => [row.id, row]));

  const members: TeamPanelMember[] = teamMemberRows.flatMap((row) => {
    const user = usersById.get(row.userId);
    if (!user) return [];
    return [
      {
        userId: user.id,
        username: user.username ?? null,
        name: user.name,
        email: user.email,
      },
    ];
  });

  const onTeam = new Set(memberUserIds);
  const addable: AddableMember[] = org.members
    .filter((member) => !onTeam.has(member.userId))
    .map((member) => ({ userId: member.userId, label: member.user.name }));

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        <Link
          href={`/app/${orgSlug}/teams`}
          className="transition hover:text-teal-300"
        >
          Teams
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        {team.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {members.length} {members.length === 1 ? "member" : "members"} ·
        created {dateFormat.format(team.createdAt)}
      </p>

      <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Package className="h-4 w-4 text-zinc-500" aria-hidden />
        Project access
      </h2>
      {projectGrants.length ? (
        <ul className="mt-3 divide-y divide-white/5 border border-white/10">
          {projectGrants.map((grant) => (
            <li key={grant.project.id}>
              <Link
                href={`/app/${orgSlug}/projects/${grant.project.slug}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/2"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">
                  {grant.project.name}
                </span>
                <span className="truncate font-mono text-xs text-zinc-500">
                  {grant.project.slug}
                </span>
                <span className="text-xs uppercase tracking-wider text-zinc-400">
                  {grant.role}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          No project access yet. Grant it from a project&apos;s Access panel
          and everyone on this team gets the role at once.
        </p>
      )}

      <h2 className="mt-10 text-sm font-semibold text-zinc-100">Members</h2>
      <div className="mt-3">
        <TeamPanel
          orgSlug={orgSlug}
          teamId={team.id}
          members={members}
          addable={addable}
          canManage={canManage}
        />
      </div>
    </div>
  );
}
