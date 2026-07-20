import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Flag, Lock } from "lucide-react";
import { resolveProjectContext } from "./resolve-project";

type Params = { params: Promise<{ org: string; project: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { project } = await params;
  return { title: project };
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** Project overview tab: what's here now, what's landing next. */
export default async function ProjectOverviewPage({ params }: Params) {
  const { org: orgSlug, project: projectSlug } = await params;
  const ctx = await resolveProjectContext(orgSlug, projectSlug);
  if (!ctx) notFound();

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Created {dateFormat.format(ctx.project.createdAt)}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border border-white/10 p-5 text-sm">
          <div className="flex items-center gap-2 font-medium text-zinc-200">
            <Flag className="h-4 w-4 text-zinc-500" aria-hidden />
            Feature Flags
          </div>
          <p className="mt-2 leading-6 text-zinc-500">
            The first product to land here. Flags belong to the organization
            and this project sees them by default; targeting narrows access.
          </p>
          <p className="mt-3 text-xs uppercase tracking-wider text-zinc-600">
            Coming soon
          </p>
        </div>
        <Link
          href={`/app/${orgSlug}/projects/${projectSlug}/access`}
          className="border border-white/10 p-5 text-sm transition hover:border-white/20 hover:bg-white/2"
        >
          <div className="flex items-center gap-2 font-medium text-zinc-200">
            <Lock className="h-4 w-4 text-zinc-500" aria-hidden />
            Access
          </div>
          <p className="mt-2 leading-6 text-zinc-500">
            Who can do what here: members and teams hold read, write, or
            admin roles on this project.
          </p>
        </Link>
      </div>
    </div>
  );
}
