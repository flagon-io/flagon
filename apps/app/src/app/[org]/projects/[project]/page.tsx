import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, Rocket, Settings, Siren } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject, listProjectRelations } from "@/lib/projects-api";
import { listOpenIncidentsForProject, type Incident } from "@/lib/incidents-api";
import { listTeams } from "@/lib/teams-api";
import { getSeverityLevels } from "@/lib/severity-levels-api";
import { getUptime } from "@/lib/uptime-api";
import { severityStyle, findLevel, type SeverityLevel } from "@/lib/incidents";
import { ProjectIcon } from "@/components/framework-badge";
import { Card, CardHead } from "./cards";
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
  const [project, relations, teams, openIncidents, levels, uptime] = await Promise.all([
    getProject(slug, key),
    listProjectRelations(slug, key),
    listTeams(slug),
    listOpenIncidentsForProject(slug, key),
    getSeverityLevels(slug),
    getUptime(slug, { project: key, window: 30 }),
  ]);
  if (!project) notFound();
  const uptimePct = uptime?.perProject?.[0]?.uptimePct ?? null;

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
          <IncidentsCard slug={slug} projectKey={project.key} incidents={openIncidents} levels={levels} uptimePct={uptimePct} canManage={canManage} />
          <EditableRepository slug={slug} projectKey={project.key} repo={project.repo} canManage={canManage} />
          <EditableLinks slug={slug} projectKey={project.key} links={project.links} canManage={canManage} />
          <SoonCard icon={<Rocket className="size-4" />} title="Deployments" />
        </aside>
      </div>
    </div>
  );
}

function IncidentsCard({ slug, projectKey, incidents, levels, uptimePct, canManage }: { slug: string; projectKey: string; incidents: Incident[]; levels: SeverityLevel[]; uptimePct: number | null; canManage: boolean }) {
  return (
    <Card>
      <CardHead
        title="Incidents"
        action={
          <span className="flex items-center gap-3">
            {canManage ? (
              <Link href={`/${slug}/projects/${projectKey}/incidents?declare=1`} className="text-xs text-teal-400 hover:text-teal-300">
                Declare
              </Link>
            ) : null}
            <Link href={`/${slug}/projects/${projectKey}/incidents`} className="text-xs text-zinc-400 hover:text-zinc-200">
              All
            </Link>
          </span>
        }
      />
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {uptimePct !== null ? (
          <div className="flex items-baseline justify-between">
            <span className="text-xs tracking-wide text-zinc-500 uppercase">Uptime · 30d</span>
            <Link
              href={`/${slug}/incidents/uptime`}
              className={`text-sm font-semibold tabular-nums ${uptimePct >= 99.9 ? "text-teal-300" : uptimePct >= 99 ? "text-amber-300" : "text-red-300"} hover:opacity-80`}
            >
              {uptimePct.toFixed(2)}%
            </Link>
          </div>
        ) : null}
        {incidents.length === 0 ? (
          <p className="inline-flex items-center gap-2 text-sm text-zinc-500">
            <Siren className="size-4 text-zinc-600" /> No open incidents
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {incidents.slice(0, 4).map((i) => {
              const s = severityStyle(findLevel(levels, i.severity)?.color ?? "#a1a1aa");
              return (
                <li key={i.number}>
                  <Link href={`/${slug}/incidents/${i.number}`} className="flex items-center gap-2 text-sm text-zinc-300 hover:text-zinc-100">
                    <span className="shrink-0 rounded border px-1 text-[10px] font-semibold" style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }}>
                      {findLevel(levels, i.severity)?.name ?? i.severity}
                    </span>
                    <span className="truncate">{i.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
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
