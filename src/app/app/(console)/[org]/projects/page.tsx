import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, Plus } from "lucide-react";
import { buttonClass } from "@/components/form-ui";
import { listProjects } from "@/lib/projects.server";
import { resolveOrg } from "../resolve-org";

export const metadata: Metadata = { title: "Projects" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Project list - `app.flagon.io/<org>/projects`. The org's unit of work;
 * products attach to projects (or to the org with per-project access). */
export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const org = await resolveOrg(slug);
  if (!org) notFound();

  const projects = await listProjects(org.id);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            {org.name}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            Projects
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {projects.length}{" "}
            {projects.length === 1 ? "project" : "projects"} in this
            organization
          </p>
        </div>
        <div className="pt-1">
          <Link
            href={appPath(`/${slug}/projects/new`)}
            className={`${buttonClass} inline-flex items-center gap-1.5`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New project
          </Link>
        </div>
      </div>

      {projects.length ? (
        <ul className="mt-8 divide-y divide-white/5 border border-white/10">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={appPath(`/${slug}/projects/${project.slug}`)}
                className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-white/2"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/10 bg-white/3 text-zinc-500"
                >
                  <Package className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {project.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-zinc-500">
                    {project.slug}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-zinc-600">
                  Created {dateFormat.format(project.createdAt)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-8 border border-dashed border-white/10 px-6 py-14 text-center">
          <Package className="mx-auto h-8 w-8 text-zinc-700" aria-hidden />
          <p className="mt-4 text-sm font-medium text-zinc-300">
            No projects yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-zinc-500">
            Projects are where your work lives. Create the first one and
            products like feature flags attach to it.
          </p>
        </div>
      )}
    </div>
  );
}
