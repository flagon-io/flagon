import type { Metadata } from "next";

type Params = { params: Promise<{ org: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { org } = await params;
  return { title: org };
}

/**
 * Organization dashboard - `app.flagon.io/<org>` (locally `/app/<org>`). Stub.
 */
export default async function OrgPage({ params }: Params) {
  const { org } = await params;

  return (
    <div className="max-w-2xl">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Organization
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
        {org}
      </h1>
      <p className="mt-3 text-sm leading-6 text-zinc-400">
        This is the dashboard for <span className="text-zinc-200">{org}</span>.
        Catalog, projects, teams, and product surfaces render here once wired
        up.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {["Catalog", "Feature Flags", "Teams", "Settings"].map((section) => (
          <div
            key={section}
            className="rounded-lg border border-white/10 p-4 text-sm text-zinc-400"
          >
            <div className="font-medium text-zinc-200">{section}</div>
            <div className="mt-1 text-zinc-500">Coming soon</div>
          </div>
        ))}
      </div>
    </div>
  );
}
