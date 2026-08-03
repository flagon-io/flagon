import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Rocket, Settings } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject, listProjectRelations } from "@/lib/projects-api";
import { listTeams } from "@/lib/teams-api";
import { ProjectIcon } from "@/components/framework-badge";
import { EditableLinks, EditableOverview, EditableRepository } from "./overview-cards";
import { RelationshipGraph } from "./relationship-graph";
import { ProjectReadme } from "./project-readme";

/**
 * Project overview — the catalog entry for one project, in a Vercel-style two
 * column layout: identity + relationships in the main column, the repository and
 * links in a right rail. Owner/admin edit the cards INLINE here (no trip to
 * settings); everyone else sees them read-only.
 */
export default async function ProjectOverview({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  const [project, relations, teams] = await Promise.all([
    getProject(slug, key),
    listProjectRelations(slug, key),
    listTeams(slug),
  ]);
  if (!project) notFound();

  const canManage = canManageOrg(membership.role);
  const teamOptions = teams.map((t) => ({ key: t.key, name: t.name }));
  const relHref = `/${slug}/projects/${key}/relationships`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header: breadcrumb, identity, settings */}
      <div className="flex flex-col gap-4">
        <nav className="flex items-center gap-1.5 text-sm text-zinc-500">
          <Link href={`/${slug}`} className="hover:text-zinc-300">
            Projects
          </Link>
          <ChevronRight className="size-3.5 text-zinc-600" />
          <span className="font-mono text-zinc-400">{project.key}</span>
        </nav>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <ProjectIcon image={project.image} framework={project.framework} size="lg" />
            <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-100">
              {project.name}
            </h1>
          </div>
          {canManage ? (
            <Link
              href={`/${slug}/projects/${key}/settings`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/8 hover:text-zinc-100"
            >
              <Settings className="size-4" /> Settings
            </Link>
          ) : null}
        </div>
      </div>

      {/* Body: main column + right rail */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <EditableOverview slug={slug} project={project} teams={teamOptions} canManage={canManage} />
          <RelationshipGraph
            slug={slug}
            projectName={project.name}
            outgoing={relations.outgoing}
            incoming={relations.incoming}
            href={relHref}
            canManage={canManage}
          />
          <ProjectReadme
            slug={slug}
            projectKey={project.key}
            projectName={project.name}
            readme={project.readme}
            canManage={canManage}
          />
        </div>

        <aside className="flex flex-col gap-5">
          <EditableRepository slug={slug} projectKey={project.key} repo={project.repo} canManage={canManage} />
          <EditableLinks slug={slug} projectKey={project.key} links={project.links} canManage={canManage} />
          <SoonCard icon={<Rocket className="size-4" />} title="Deployments" />
        </aside>
      </div>
    </div>
  );
}

function SoonCard({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-4 py-3.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
        {icon}
      </span>
      <div>
        <p className="text-sm font-medium text-zinc-300">{title}</p>
        <p className="text-xs text-zinc-600">Coming soon</p>
      </div>
    </div>
  );
}
