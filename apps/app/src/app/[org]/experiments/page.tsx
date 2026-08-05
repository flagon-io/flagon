import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { listExperiments, listMetrics } from "@/lib/experiments-api";
import { listFlags, FLAG_ENVIRONMENTS } from "@/lib/flags-api";
import { ExperimentsTable } from "./experiments-table";

/**
 * The Experiments list. An experiment is a measured rollout of a flag; like flags
 * it is global to the organization. Data comes from the API over HTTP. The create
 * dialog needs the org's flags (the arms) and metrics (the outcomes), loaded
 * alongside so the modal opens instantly.
 */
export default async function ExperimentsOverview({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ create?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const [experiments, flags, metrics] = await Promise.all([
    listExperiments(slug),
    listFlags(slug),
    listMetrics(slug),
  ]);

  return (
    <ExperimentsTable
      slug={slug}
      experiments={experiments}
      flags={flags.map((f) => ({ key: f.key, name: f.name }))}
      metrics={metrics.map((m) => ({ key: m.key, name: m.name }))}
      environments={FLAG_ENVIRONMENTS.map((e) => ({ key: e.key, name: e.name }))}
      initialCreate={Boolean(sp.create)}
    />
  );
}
