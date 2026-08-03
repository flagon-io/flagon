import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject, listProjects, listProjectRelations } from "@/lib/projects-api";
import { RelationsManager } from "./relations-manager";

/**
 * Project relationships — the service-map edges from/to this project (depends on,
 * part of, related to). Any member sees the map; owner/admin add and remove the
 * project's own outgoing edges. Incoming edges are owned by the other project.
 */
export default async function ProjectRelationships({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  const [project, relations, projects] = await Promise.all([
    getProject(slug, key),
    listProjectRelations(slug, key),
    listProjects(slug),
  ]);
  if (!project) notFound();

  const canManage = canManageOrg(membership.role);
  const targets = projects
    .filter((p) => p.key !== key)
    .map((p) => ({ key: p.key, name: p.name }));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}/projects/${key}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> {project.name}
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Relationships</h1>
        <p className="mt-1 text-sm text-zinc-500">
          How {project.name} relates to the rest of the catalog.
        </p>
      </div>

      <RelationsManager
        slug={slug}
        projectKey={key}
        relations={relations}
        targets={targets}
        canManage={canManage}
      />
    </div>
  );
}
