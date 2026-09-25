import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Code2,
  FileText,
  Link2,
  Package,
  Pencil,
  Plus,
  Rocket,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { getProject, projectCan } from "@/lib/flagon-api";
import { Badge, Card } from "@flagon-io/ui";
import { Markdown } from "@/components/markdown";
import { PageBody } from "@/components/shell/page-header";
import { PageBreadcrumb } from "@/components/shell/page-breadcrumb";
import { ProjectAboutEdit } from "@/components/projects/project-about-edit";

function repoHost(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const project = await getProject(slug, projectSlug);
  if (!project) notFound();

  // README and About edits need write on this project (not just org membership).
  const canManage = projectCan(project, "project:write");
  const editHref = `/${slug}/projects/${project.slug}/edit`;
  const hasReadme = project.readme.trim().length > 0;
  const host = repoHost(project.repository_url);

  return (
    <PageBody className="max-w-6xl">
      <PageBreadcrumb label={project.name} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-hairline bg-panel/50 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText className="size-4 text-muted-foreground" />
                README.md
              </span>
              {canManage && hasReadme && (
                <Link
                  href={editHref}
                  aria-label="Edit README"
                  title="Edit README"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </Link>
              )}
            </div>
            <div className="p-6">
              {hasReadme ? (
                <Markdown>{project.readme}</Markdown>
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                    <FileText className="size-5" />
                  </span>
                  <p className="text-sm font-medium text-foreground">No README yet</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    A README describes what this project does. Later it can sync automatically from
                    the linked repository.
                  </p>
                  {canManage && (
                    <Link
                      href={editHref}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
                    >
                      <Plus className="size-4" />
                      Add a README
                    </Link>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* The "About" rail. Real bits (description, linked repo) are live;
            the rest is a preview of what we'll surface from the linked repository. */}
        <aside className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">About</h2>
              {canManage && (
                <ProjectAboutEdit
                  orgSlug={slug}
                  project={{
                    slug: project.slug,
                    description: project.description,
                    repository_url: project.repository_url,
                  }}
                />
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {project.description || "No description provided."}
            </p>
            {host && (
              <a
                href={project.repository_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-link hover:underline"
              >
                <Link2 className="size-4" />
                {host}
              </a>
            )}
          </div>

          <div className="space-y-3 border-t border-hairline pt-4">
            <AboutRow icon={Tag} label="Releases" hint="From the linked repository" />
            <AboutRow icon={Package} label="Packages" hint="From the linked repository" />
            <AboutRow icon={Rocket} label="Deployments" hint="Builds & rollouts" />
            <AboutRow icon={Code2} label="Languages" hint="Detected from the code" />
          </div>
        </aside>
      </div>
    </PageBody>
  );
}

function AboutRow({ icon: Icon, label, hint }: { icon: LucideIcon; label: string; hint: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      <span className="flex-1">
        <span className="block text-sm font-medium text-muted-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground/70">{hint}</span>
      </span>
      <Badge variant="secondary" className="normal-case tracking-normal">
        Soon
      </Badge>
    </div>
  );
}
