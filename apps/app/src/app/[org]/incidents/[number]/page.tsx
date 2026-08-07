import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getIncident } from "@/lib/incidents-api";
import { listPolicies } from "@/lib/oncall-api";
import { listRunbooks } from "@/lib/runbooks-api";
import { listProjects } from "@/lib/projects-api";
import { listMembers } from "@/lib/flags-api";
import { getSeverityLevels } from "@/lib/severity-levels-api";
import { IncidentDetail } from "./incident-detail";

/**
 * One incident: severity/status, the affected services, the timeline, the current
 * responder, and the ack/resolve controls. Any member acts; only managers edit
 * structural metadata (via the controls the client gates).
 */
export default async function IncidentPage({ params }: { params: Promise<{ org: string; number: string }> }) {
  const { org: slug, number: raw } = await params;
  const number = Number(raw);
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  if (!Number.isInteger(number)) notFound();

  const [detail, orgMembers, projects, runbooks, policies, levels] = await Promise.all([
    getIncident(slug, number),
    listMembers(slug),
    listProjects(slug),
    listRunbooks(slug),
    listPolicies(slug),
    getSeverityLevels(slug),
  ]);
  if (!detail) notFound();

  // Resolve the responder's name from the org roster (the responder can be an
  // escalation-policy target who is not on the owning team, so use every member).
  const responderName = detail.responderUserId
    ? orgMembers.find((m) => m.userId === detail.responderUserId)?.name ?? null
    : null;

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/${slug}/incidents`} className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="size-4" /> Incidents
      </Link>
      <IncidentDetail
        slug={slug}
        detail={detail}
        levels={levels}
        responderName={responderName}
        responderVia={detail.responderVia}
        orgMembers={orgMembers.map((m) => ({ userId: m.userId, name: m.name }))}
        projects={projects.map((p) => ({ key: p.key, name: p.name }))}
        runbooks={runbooks.map((r) => ({ key: r.key, name: r.name }))}
        policies={policies.map((p) => ({ key: p.key, name: p.name }))}
        canManage={canManageOrg(membership.role)}
      />
    </div>
  );
}
