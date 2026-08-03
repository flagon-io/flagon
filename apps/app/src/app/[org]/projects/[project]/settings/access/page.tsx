import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject, listProjectAccess } from "@/lib/projects-api";
import { listTeams } from "@/lib/teams-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { ProjectAccessManager } from "../project-access";

/**
 * Project access — its own page under the project's Settings. Who can act on this
 * project, and the role each team holds (the owning team is an implicit admin).
 * Owner/admin only; everyone else is bounced to the read-only overview.
 */
export default async function ProjectAccessSettings({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!canManageOrg(membership.role)) redirect(`/${slug}/projects/${key}`);

  const [project, teams, access] = await Promise.all([
    getProject(slug, key),
    listTeams(slug),
    listProjectAccess(slug, key),
  ]);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/projects/${key}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> {project.name}
      </Link>

      <SettingsHeader title="Access" description="Teams that can act on this project, and the role each holds." />

      <SettingsSection
        title="Teams"
        description="The owning team is always an admin. Grant other teams a role."
      >
        <ProjectAccessManager
          slug={slug}
          projectKey={project.key}
          access={access}
          teams={teams.map((t) => ({ key: t.key, name: t.name }))}
          canManage
        />
      </SettingsSection>
    </div>
  );
}
