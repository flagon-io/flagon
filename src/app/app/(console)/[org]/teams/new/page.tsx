import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveOrg } from "../../resolve-org";
import { NewTeamForm } from "../new-team-form";

export const metadata: Metadata = { title: "New team" };

/** Dedicated team creation page - `app.flagon.io/<org>/teams/new`. */
export default async function NewTeamPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const [org, session] = await Promise.all([
    resolveOrg(slug),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!org || !session) notFound();

  const role = org.members.find((m) => m.userId === session.user.id)?.role;
  if (role !== "owner" && role !== "admin") notFound();

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        <Link
          href={appPath(`/${slug}/teams`)}
          className="transition hover:text-teal-300"
        >
          Teams
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        Create a team
      </h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Teams group people so you can share projects and products with everyone
        at once. After creating it, add members from the team&apos;s page.
      </p>
      <div className="mt-8">
        <NewTeamForm orgSlug={slug} />
      </div>
    </div>
  );
}
