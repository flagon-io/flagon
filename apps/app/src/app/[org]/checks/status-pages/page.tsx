import { redirect } from "next/navigation";
import { Signal } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { listProjects } from "@/lib/projects-api";

/**
 * Status pages — stubbed surface. The real feature (public pages that publish the health
 * of selected services + incident history + subscribers) lands in a later phase; this
 * scaffold puts it in the IA and previews the services (projects) it would publish.
 */
export default async function StatusPagesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const projects = await listProjects(slug);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Status pages</h1>
          <span className="rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-400 uppercase">
            Soon
          </span>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-zinc-500">
          Publish a public status page that shows the live health of the services you choose, a 90-day uptime history,
          and your open incidents. Visitors can subscribe for updates. Services are your <strong>projects</strong>, and
          incidents come straight from <strong>Incidents</strong>, so a page stays current on its own.
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-white/12 bg-white/2 p-6">
        <div className="flex items-start gap-3">
          <Signal className="mt-0.5 size-5 text-zinc-300" />
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">A page publishes your services</h2>
            <p className="mt-1 text-sm text-zinc-500">
              When status pages land, you&apos;ll pick which projects appear and each will show its current state, driven
              by its checks and incidents. Here&apos;s what this org would publish:
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {projects.length ? (
            projects.slice(0, 8).map((p) => (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/2 px-4 py-2.5"
              >
                <span className="truncate text-sm text-zinc-200">{p.name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className="size-1.5 rounded-full bg-zinc-500" /> Operational
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-zinc-500">
              No projects yet. Create a project and its health will be publishable here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
