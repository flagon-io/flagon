import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";
import { getUploadConfig } from "@/lib/uploads-api";
import { SettingsHeader, SettingsSection } from "@/components/settings/section";
import { DeleteProject, GeneralForm } from "./catalog-form";
import { ProjectIconUpload } from "./project-icon-upload";

/**
 * Project settings — General. The project's identity (name + icon) and the danger
 * zone. Catalog metadata is edited inline on the overview, and access has its own
 * page. Owner/admin only; everyone else is bounced to the read-only overview.
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

  const [project, uploadConfig] = await Promise.all([
    getProject(slug, key),
    getUploadConfig(slug),
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

      <SettingsHeader
        title="General"
        description="The project's identity. Edit its catalog details on the overview."
      />

      <SettingsSection title="Name" description="How this project is named across the catalog.">
        <GeneralForm slug={slug} project={project} />
      </SettingsSection>

      <SettingsSection
        title="Icon"
        description="Shown in the catalog. Defaults to a monogram from the stack."
      >
        <ProjectIconUpload
          slug={slug}
          projectKey={project.key}
          framework={project.framework}
          initialImage={project.image}
          canManage
          uploadsEnabled={uploadConfig.enabled}
          maxSizeBytes={uploadConfig.maxSizeBytes}
          acceptedTypes={uploadConfig.acceptedTypes}
        />
      </SettingsSection>

      <SettingsSection title="Danger zone" description="Irreversible actions.">
        <DeleteProject slug={slug} projectKey={project.key} />
      </SettingsSection>
    </div>
  );
}
