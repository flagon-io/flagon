import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Package, UserRound, Users } from "lucide-react";
import { db } from "@/db/client";
import { users } from "@/db/auth-schema";
import { listMemberProjectGrants } from "@/lib/project-access.server";
import { listUserTeams } from "@/lib/teams.server";
import { resolveOrg } from "../../resolve-org";

type Params = { params: Promise<{ org: string; username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  return { title: username };
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/**
 * Member profile within an organization -
 * `app.flagon.io/<org>/members/<username>`: who they are, their org role,
 * the teams they're on, and the project access they hold.
 */
export default async function MemberProfilePage({ params }: Params) {
  const { org: orgSlug, username } = await params;
  const org = await resolveOrg(orgSlug);
  if (!org) notFound();

  const [user] = await db
    .select({
      id: users.id,
      username: users.username,
      displayUsername: users.displayUsername,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
    .limit(1);
  const membership = user
    ? org.members.find((m) => m.userId === user.id)
    : undefined;
  if (!user || !membership) notFound();

  const [memberTeams, grants] = await Promise.all([
    listUserTeams(org.id, user.id),
    listMemberProjectGrants(org.id, user.id),
  ]);

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        <Link
          href={appPath(`/${orgSlug}/members`)}
          className="transition hover:text-teal-300"
        >
          Members
        </Link>
      </p>

      <div className="mt-5 flex items-center gap-4">
        <div
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/20 text-xl font-semibold uppercase text-teal-300"
        >
          {user.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-zinc-100">
            {user.name}
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
              {membership.role}
            </span>
          </h1>
          <p className="mt-0.5 truncate text-sm text-zinc-500">
            {user.displayUsername ?? user.username} · {user.email} · joined{" "}
            {dateFormat.format(membership.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Users className="h-4 w-4 text-zinc-500" aria-hidden />
            Teams
          </h2>
          {memberTeams.length ? (
            <ul className="mt-3 divide-y divide-white/5 border border-white/10">
              {memberTeams.map((team) => (
                <li key={team.id}>
                  <Link
                    href={appPath(`/${orgSlug}/teams/${team.id}`)}
                    className="flex items-center px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/2 hover:text-teal-300"
                  >
                    {team.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">Not on any teams yet.</p>
          )}
        </section>

        <section>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Package className="h-4 w-4 text-zinc-500" aria-hidden />
            Project access
          </h2>
          {grants.length ? (
            <ul className="mt-3 divide-y divide-white/5 border border-white/10">
              {grants.map((grant) => (
                <li
                  key={`${grant.project.id}-${grant.via.type}-${
                    grant.via.type === "team" ? grant.via.teamId : "direct"
                  }`}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <Link
                    href={appPath(`/${orgSlug}/projects/${grant.project.slug}`)}
                    className="min-w-0 flex-1 truncate text-zinc-200 transition hover:text-teal-300"
                  >
                    {grant.project.name}
                  </Link>
                  <span className="text-xs text-zinc-500">
                    {grant.via.type === "team"
                      ? `via ${grant.via.teamName}`
                      : "direct"}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-zinc-400">
                    {grant.role}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              No explicit grants.{" "}
              {membership.role === "owner" || membership.role === "admin"
                ? "As an organization " +
                  membership.role +
                  ", they have admin access to every project."
                : "As a member, they can see every project."}
            </p>
          )}
        </section>
      </div>

      <p className="mt-10 flex items-center gap-2 text-xs text-zinc-600">
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        Roles and membership are managed from the{" "}
        <Link
          href={appPath(`/${orgSlug}/members`)}
          className="text-zinc-500 underline transition hover:text-zinc-300"
        >
          members page
        </Link>
        .
      </p>
    </div>
  );
}
