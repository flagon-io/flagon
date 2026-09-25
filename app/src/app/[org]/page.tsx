import { getOrgContext } from "@/lib/org-context";
import { AgentLauncher } from "@/components/agent/agent-launcher";

export default async function OrgDashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { user } = await getOrgContext(slug);

  // The dashboard is intentionally just the command surface for now, centered on
  // the page. Resource cards will come back as their own thing later.
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <AgentLauncher name={user.name ?? null} />
    </div>
  );
}
