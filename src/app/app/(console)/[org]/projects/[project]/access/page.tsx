import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { listProjectGrants } from "@/lib/project-access.server";
import { resolveProjectContext } from "../resolve-project";
import { AccessPanel, type SubjectOption } from "../access-panel";

export const metadata: Metadata = { title: "Access" };

/**
 * Access tab: repository-style access control. Org owners/admins are
 * implicit admins, every member reads, grants to members/teams elevate.
 */
export default async function ProjectAccessPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: orgSlug, project: projectSlug } = await params;
  const ctx = await resolveProjectContext(orgSlug, projectSlug);
  if (!ctx) notFound();

  const grants = await listProjectGrants(ctx.org.id, ctx.project.id);
  const memberOptions: SubjectOption[] = ctx.org.members.map((member) => ({
    id: member.userId,
    label: member.user.name,
  }));
  const teams = await auth.api.listOrganizationTeams({
    query: { organizationId: ctx.org.id },
    headers: await headers(),
  });
  const teamOptions: SubjectOption[] = teams.map((team) => ({
    id: team.id,
    label: team.name,
  }));

  return (
    <div>
      <p className="text-sm leading-6 text-zinc-500">
        Organization owners and admins have full control; every member can see
        this project. Grants give members or teams a bigger role here.
      </p>
      <div className="mt-5">
        <AccessPanel
          orgSlug={orgSlug}
          projectSlug={projectSlug}
          grants={grants.map((grant) => ({
            id: grant.id,
            role: grant.role,
            subject: grant.subject,
          }))}
          memberOptions={memberOptions}
          teamOptions={teamOptions}
          canManage={ctx.role === "admin"}
        />
      </div>
    </div>
  );
}
