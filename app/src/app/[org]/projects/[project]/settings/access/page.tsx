import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMe, getProject } from "@/lib/flagon-api";
import { ProjectAccessManager } from "@/components/projects/project-access-manager";

export default async function ProjectAccessPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // Seeing access needs read; the manager gates management (add/change/remove)
  // on the caller's effective admin role, matching the API.
  const me = await getMe().catch(() => null);
  const role = me?.orgs.find((o) => o.slug === slug)?.role ?? "viewer";
  if (role === "viewer") redirect(`/${slug}/projects/${projectSlug}`);

  const project = await getProject(slug, projectSlug).catch(() => null);
  if (!project) notFound();

  return (
    <ProjectAccessManager
      slug={slug}
      project={project.slug}
      currentUserId={me?.user.id ?? ""}
      orgRole={role}
    />
  );
}
