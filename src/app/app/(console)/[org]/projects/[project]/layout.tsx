import { appPath } from "@/lib/urls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveProjectContext } from "./resolve-project";
import { ProjectTabs } from "./project-tabs";

/**
 * Project shell - repository-style: persistent header (breadcrumb, name,
 * slug, your role) with tab navigation; each tab is its own page below.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: orgSlug, project: projectSlug } = await params;
  const ctx = await resolveProjectContext(orgSlug, projectSlug);
  if (!ctx) notFound();

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        <Link
          href={appPath(`/${orgSlug}/projects`)}
          className="transition hover:text-teal-300"
        >
          Projects
        </Link>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
          {ctx.project.name}
        </h1>
        <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400">
          {ctx.project.slug}
        </span>
        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
          {ctx.role}
        </span>
      </div>

      <ProjectTabs
        orgSlug={orgSlug}
        projectSlug={projectSlug}
        canManage={ctx.role === "admin"}
      />

      <div className="mt-8">{children}</div>
    </div>
  );
}
