import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { Package } from "lucide-react";
import { auth } from "@/lib/auth";
import { listTeamProjects } from "@/lib/project-access.server";
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

  const [teamMemberRows, teamProjects] = await Promise.all([
    listTeamRoster(team.id),
    listTeamProjects(org.id, team.id),
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
          href={appPath(`/${orgSlug}/teams`)}
          className="transition hover:text-teal-300"
        >
          Teams
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        {team.name}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {members.length} {members.length === 1 ? "member" : "members"} · created{" "}
        {dateFormat.format(team.createdAt)}
      </p>

      <h2 className="mt-8 flex items-center gap-2 text-sm font-semibold text-zinc-100">
        <Package className="h-4 w-4 text-zinc-500" aria-hidden />
        Projects
      </h2>
      {/* Ownership and access are separate facts about the same project, so
        they are shown on ONE row rather than in two lists: a team that owns a
        project it can no longer open is the row worth noticing, and two lists
        would bury it by showing it in only one of them. */}
      {teamProjects.length ? (
        <ul className="mt-3 divide-y divide-white/5 border border-white/10">
          {teamProjects.map((entry) => (
            <li key={entry.project.id}>
              <Link
                href={appPath(`/${orgSlug}/projects/${entry.project.slug}`)}
                className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/2"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">
                  {entry.project.name}
                </span>
                <span className="truncate font-mono text-xs text-zinc-500">
                  {entry.project.slug}
                </span>
                {entry.owner ? (
                  <span className="rounded-full border border-teal-400/20 bg-teal-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-teal-300">
                    Owner
                  </span>
                ) : null}
                <span
                  className={
                    entry.role
                      ? "text-xs uppercase tracking-wider text-zinc-400"
                      : "text-xs uppercase tracking-wider text-zinc-600"
                  }
                >
                  {entry.role ?? "No access"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          This team neither owns nor can open any project. Grant access from a
          project&apos;s Access panel and everyone on this team gets the role at
          once; name the team as an owner from the project&apos;s Overview to
          record that it is responsible for one.
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
