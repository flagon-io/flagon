import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { AgentLauncher } from "@/components/agent/agent-launcher";

export default async function OrgDashboard({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const [me, session] = await Promise.all([
    getMe(),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!me) redirect("/login");
  if (!me.orgs.find((o) => o.slug === slug)) redirect("/");

  // The dashboard is intentionally just the command surface for now, centered on
  // the page. Resource cards will come back as their own thing later.
  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <AgentLauncher name={session?.user?.name ?? null} />
    </div>
  );
}
