import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import { buttonClass } from "@/components/form-ui";
import { teamMemberCounts } from "@/lib/teams.server";
import { resolveOrg } from "../resolve-org";

export const metadata: Metadata = { title: "Teams" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Team list - `app.flagon.io/<org>/teams`. Teams are named groups of org
 * members; resources (projects, flags) are shareable with teams the way
 * code hosts scope repository access. Owners and admins manage them. */
export default async function TeamsPage({
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

  const teams = await auth.api.listOrganizationTeams({
    query: { organizationId: org.id },
    headers: requestHeaders,
  });
  const counts = await teamMemberCounts(org.id);

  const role = org.members.find((m) => m.userId === session.user.id)?.role;
  const canManage = role === "owner" || role === "admin";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            {org.name}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            Teams
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {teams.length} {teams.length === 1 ? "team" : "teams"} in this
            organization
          </p>
        </div>
        {canManage ? (
          <div className="pt-1">
            <Link
              href={`/app/${slug}/teams/new`}
              className={`${buttonClass} inline-flex items-center gap-1.5`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              New team
            </Link>
          </div>
        ) : null}
      </div>

      {teams.length ? (
        <ul className="mt-8 divide-y divide-white/5 border border-white/10">
          {teams.map((team) => {
            const count = counts.get(team.id) ?? 0;
            return (
              <li key={team.id}>
                <Link
                  href={`/app/${slug}/teams/${team.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/2"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
                  >
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {team.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {count} {count === 1 ? "member" : "members"}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-zinc-600">
                    Created {dateFormat.format(team.createdAt)}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-8 border border-dashed border-white/10 px-6 py-14 text-center">
          <Users className="mx-auto h-8 w-8 text-zinc-700" aria-hidden />
          <p className="mt-4 text-sm font-medium text-zinc-300">No teams yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-zinc-500">
            Teams group people so you can share projects and products with
            everyone at once instead of one member at a time.
          </p>
          {!canManage ? (
            <p className="mt-3 text-xs text-zinc-600">
              Ask an organization owner or admin to create one.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
