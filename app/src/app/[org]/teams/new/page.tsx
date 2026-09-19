import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { NewTeamForm } from "@/components/teams/new-team-form";
import { PageHeader, PageBody } from "@/components/shell/page-header";

export default async function NewTeamPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "member";
  // Only owners and admins create teams.
  if (role !== "owner" && role !== "admin") redirect(`/${slug}/teams`);

  return (
    <>
      <PageHeader
        title="New team"
        description="A named group of members. Grant it a role on a project and everyone on the team gets that access."
      />
      <PageBody>
        <NewTeamForm orgSlug={slug} />
      </PageBody>
    </>
  );
}
