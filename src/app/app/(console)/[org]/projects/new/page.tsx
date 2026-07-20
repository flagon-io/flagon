import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveOrg } from "../../resolve-org";
import { NewProjectForm } from "../new-project-form";

export const metadata: Metadata = { title: "New project" };

/** Dedicated project creation page - `app.flagon.io/<org>/projects/new`. */
export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const org = await resolveOrg(slug);
  if (!org) notFound();

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        <Link
          href={`/app/${slug}/projects`}
          className="transition hover:text-teal-300"
        >
          Projects
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Create a project
      </h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Projects are where your work lives. Products attach to them, and
        access is shared with members and teams from the project&apos;s page.
      </p>
      <div className="mt-8">
        <NewProjectForm orgSlug={slug} />
      </div>
    </div>
  );
}
