import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject, listProjectAccess } from "@/lib/projects-api";
import { listTeams } from "@/lib/teams-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { CatalogForm, DeleteProject } from "./catalog-form";
import { ProjectAccessManager } from "./project-access";

/**
 * Project settings — edit the catalog metadata (owner team, type, lifecycle,
 * tier, tags, description) and the danger zone. Owner/admin only; everyone else
 * is bounced to the read-only overview.
 */
export default async function ProjectSettings({
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

  const teamOptions = teams.map((t) => ({ key: t.key, name: t.name }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/projects/${key}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" /> {project.name}
      </Link>

      <SettingsHeader title="Project settings" description="Catalog metadata and ownership." />

      <SettingsSection title="Catalog" description="How this project shows up in the catalog.">
        <CatalogForm slug={slug} project={project} teams={teamOptions} />
      </SettingsSection>

      <SettingsSection
        title="Access"
        description="Teams that can act on this project, and the role each holds."
      >
        <ProjectAccessManager
          slug={slug}
          projectKey={project.key}
          access={access}
          teams={teamOptions}
          canManage
        />
      </SettingsSection>

      <SettingsSection title="Danger zone" description="Irreversible actions.">
        <DeleteProject slug={slug} projectKey={project.key} />
      </SettingsSection>
    </div>
  );
}
