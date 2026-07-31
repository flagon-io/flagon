import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, GitFork, Rocket, Settings, ShieldCheck, Users } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";
import { LIFECYCLES, TIERS, labelFor } from "@/lib/catalog";
import { ProjectReadme } from "./project-readme";

/**
 * Project overview — the catalog card for one project: its ownership and metadata,
 * plus the catalog surfaces still to come. Any member sees it; editing the
 * metadata lives on the settings page (owner/admin only).
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
  const project = await getProject(slug, key);
  if (!project) notFound();

  const canManage = canManageOrg(membership.role);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="size-4" /> Projects
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            {project.name}
          </h1>
          <p className="mt-1 font-mono text-sm text-zinc-500">{project.key}</p>
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

      {project.description ? (
        <p className="max-w-2xl text-sm text-zinc-400">{project.description}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoCard label="Owner">
          {project.ownerTeam ? (
            <Link
              href={`/${slug}/teams/${project.ownerTeam.key}`}
              className="inline-flex items-center gap-1.5 text-zinc-200 hover:text-zinc-100"
            >
              <Users className="size-4 text-zinc-500" /> {project.ownerTeam.name}
            </Link>
          ) : (
            <span className="text-zinc-500">No owner</span>
          )}
        </InfoCard>
        <InfoCard label="Lifecycle">
          <Value text={labelFor(LIFECYCLES, project.lifecycle)} />
        </InfoCard>
        <InfoCard label="Tier">
          <Value text={labelFor(TIERS, project.tier)} />
        </InfoCard>
      </div>

      {project.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {project.tags.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <ProjectReadme
        slug={slug}
        projectKey={project.key}
        projectName={project.name}
        readme={project.readme}
        canManage={canManage}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SoonCard icon={<Rocket className="size-4" />} title="Deployments" />
        <SoonCard icon={<GitFork className="size-4" />} title="Dependencies" />
        <SoonCard icon={<ShieldCheck className="size-4" />} title="Scorecards" />
      </div>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/2 px-4 py-3">
      <p className="mb-1.5 text-xs font-medium text-zinc-500">{label}</p>
      <p className="truncate text-sm">{children}</p>
    </div>
  );
}

function Value({ text }: { text: string | null }) {
  return text ? (
    <span className="text-zinc-200">{text}</span>
  ) : (
    <span className="text-zinc-500">—</span>
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
