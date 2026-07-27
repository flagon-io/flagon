import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";

/**
 * The organization home: its Projects list. Projects are not built yet, so this
 * is the empty state for now; when they land, the list renders here. Deployments
 * and the rest live under an individual project, not at this level.
 */
export default async function OrgProjects({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          Projects
        </h1>
        <span
          aria-disabled="true"
          title="Creating projects — coming soon"
          className="cursor-not-allowed rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-500"
        >
          New Project
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
          <Boxes className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-200">No projects yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Projects are coming soon. You will create and manage them here.
          </p>
        </div>
      </div>
    </div>
  );
}
