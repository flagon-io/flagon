import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { listTeams } from "@/lib/teams-api";
import { TeamsView } from "./teams-view";

/**
 * Teams — groups of people that own projects in the catalog. Any member sees the
 * teams; creating one is owner/admin only (managing a team's membership is then
 * open to org managers and that team's maintainers).
 */
export default async function TeamsPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ create?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const teams = await listTeams(slug);
  return (
    <TeamsView
      slug={slug}
      teams={teams}
      canCreate={canManageOrg(membership.role)}
      initialCreate={Boolean(sp.create)}
    />
  );
}
