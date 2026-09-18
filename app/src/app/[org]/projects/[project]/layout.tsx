import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { Boxes, ChevronDown, Code2, ExternalLink, GitBranch } from "lucide-react";
import { auth } from "@/lib/auth";
import { getMe, getProject } from "@/lib/flagon-api";
import { cn } from "@flagon-io/ui";
import { ProjectTabs } from "@/components/projects/project-tabs";

const COLUMN = "mx-auto w-full max-w-6xl px-6 lg:px-8";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const project = await getProject(slug, projectSlug).catch(() => null);
  if (!project) notFound();

  const me = await getMe().catch(() => null);
  const canManage = (me?.orgs.find((o) => o.slug === slug)?.role ?? "viewer") !== "viewer";
  const base = `/${slug}/projects/${project.slug}`;

  return (
    <>
      <header className="border-b border-hairline">
        <div className={cn(COLUMN, "pt-6")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-foreground">
                <Boxes className="size-6 shrink-0 text-muted-foreground" />
                <span className="truncate">{project.name}</span>
              </h1>
              {project.description && (
                <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Repo-style clone action - a viewer/clone of the linked repo is
                  coming; disabled for now so the direction is visible. */}
              <span
                title="Clone via Flagon - coming soon"
                aria-disabled="true"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md bg-brand/15 px-2.5 py-1.5 text-sm font-medium text-brand-bright opacity-80"
              >
                <Code2 className="size-4" />
                Code
                <ChevronDown className="size-3.5" />
              </span>
              {project.repository_url && (
                <a
                  href={project.repository_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-panel"
                >
                  <GitBranch className="size-4 text-muted-foreground" />
                  Repository
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </a>
              )}
            </div>
          </div>
          <div className="mt-4">
            <ProjectTabs base={base} canManage={canManage} />
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
