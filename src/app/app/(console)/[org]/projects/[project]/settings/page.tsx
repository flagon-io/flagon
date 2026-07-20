import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProjectContext } from "../resolve-project";
import { ProjectSettingsPanel } from "./settings-panel";

export const metadata: Metadata = { title: "Project settings" };

/** Settings tab: rename + danger zone. Project admins only. */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: orgSlug, project: projectSlug } = await params;
  const ctx = await resolveProjectContext(orgSlug, projectSlug);
  if (!ctx || ctx.role !== "admin") notFound();

  return (
    <ProjectSettingsPanel
      orgSlug={orgSlug}
      projectSlug={projectSlug}
      currentName={ctx.project.name}
    />
  );
}
