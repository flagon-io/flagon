import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { getIncident } from "@/lib/incidents-api";
import { listMembers } from "@/lib/flags-api";
import { listTeamMembers } from "@/lib/teams-api";
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

  const [detail, orgMembers] = await Promise.all([getIncident(slug, number), listMembers(slug)]);
  if (!detail) notFound();

  // Resolve the responder's name from the owning team's roster.
  let responderName: string | null = null;
  if (detail.responderUserId && detail.incident.ownerTeam) {
    const roster = await listTeamMembers(slug, detail.incident.ownerTeam.key);
    responderName = roster.find((m) => m.userId === detail.responderUserId)?.name ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/${slug}/incidents`} className="inline-flex w-fit items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft className="size-4" /> Incidents
      </Link>
      <IncidentDetail
        slug={slug}
        detail={detail}
        responderName={responderName}
        orgMembers={orgMembers.map((m) => ({ userId: m.userId, name: m.name }))}
      />
    </div>
  );
}
