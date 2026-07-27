import { redirect } from "next/navigation";
import { Flag } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";

/**
 * The Flags area overview. Flags are GLOBAL to the organization (evaluated with
 * your SDK keys across any project), so they live here at the org level rather
 * than under a project. The surfaces (flags, segments, experiments, ...) are
 * still being built; this is their landing for now.
 */
export default async function FlagsOverview({
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
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            Flags
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Global to your organization, available with your keys across every
            project.
          </p>
        </div>
        <span
          aria-disabled="true"
          title="Creating flags — coming soon"
          className="cursor-not-allowed rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-zinc-500"
        >
          New Flag
        </span>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/2 px-6 py-16 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/5 text-zinc-400">
          <Flag className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-200">No flags yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Flags, segments, and experiments are coming soon. You will create and
            manage them here.
          </p>
        </div>
      </div>
    </div>
  );
}
