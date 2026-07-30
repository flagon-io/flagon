import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, GitBranch, Lock, Rocket } from "lucide-react";
import { IconGitHub } from "@flagon/design";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";

/**
 * Project overview — the catalog card for one project. Any member sees it; the
 * deeper configuration (settings, env vars/secrets) is role-gated on its own
 * pages. Deployments and Domains are coming; this is the landing today.
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

  const repoUrl = project.repoFullName ? `https://github.com/${project.repoFullName}` : null;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${slug}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            {project.name}
          </h1>
          {project.repoFullName ? (
            <a
              href={repoUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300"
            >
              <IconGitHub className="h-3.5 w-3.5" /> {project.repoFullName}
              {project.repoPrivate ? <Lock className="h-3 w-3" /> : null}
            </a>
          ) : (
            <p className="mt-1 text-sm text-amber-400/80">Repository disconnected</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoCard label="Repository">
          <span className="flex items-center gap-1.5 text-zinc-200">
            <IconGitHub className="h-4 w-4 text-zinc-500" />
            {project.repoFullName ?? "—"}
          </span>
        </InfoCard>
        <InfoCard label="Production branch">
          <span className="flex items-center gap-1.5 text-zinc-200">
            <GitBranch className="h-4 w-4 text-zinc-500" />
            {project.repoDefaultBranch ?? "—"}
          </span>
        </InfoCard>
        <InfoCard label="Root directory">
          <span className="font-mono text-zinc-200">{project.rootDirectory || "./"}</span>
        </InfoCard>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-4 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-zinc-400">
          <Rocket className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-200">Deployments are coming</p>
          <p className="mt-1 text-sm text-zinc-500">
            Your repository is connected. Builds and deployments will land here.
            Meanwhile, configure environment variables and settings from the
            project nav.
          </p>
        </div>
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
