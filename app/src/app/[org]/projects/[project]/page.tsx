import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { ExternalLink, FileText, GitBranch } from "lucide-react";
import { auth } from "@/lib/auth";
import { getProject } from "@/lib/flagon-api";
import { Card } from "@flagon-io/ui";
import { Markdown } from "@/components/markdown";
import { PageHeader, PageBody } from "@/components/shell/page-header";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: projectSlug } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const project = await getProject(slug, projectSlug).catch(() => null);
  if (!project) notFound();

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description || "No description"}
        actions={
          project.repository_url && (
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
          )
        }
      />
      <PageBody className="max-w-4xl">
        <div className="flex items-center gap-2 pb-3 text-sm font-medium text-muted-foreground">
          <FileText className="size-4" />
          README.md
        </div>
        <Card className="p-6">
          {project.readme.trim() ? (
            <Markdown>{project.readme}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">
              No README yet. Add one by editing the project (or, later, by linking a repository to
              sync it automatically).
            </p>
          )}
        </Card>
      </PageBody>
    </>
  );
}
