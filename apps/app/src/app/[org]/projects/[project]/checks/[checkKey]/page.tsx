import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";
import { getCheck } from "@/lib/checks-api";
import { CheckDetailView } from "./check-detail";

/** A single check's detail: status, uptime, latency, recent probes, and controls. */
export default async function CheckDetailPage({
  params,
}: {
  params: Promise<{ org: string; project: string; checkKey: string }>;
}) {
  const { org: slug, project: projectKey, checkKey } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");

  const check = await getCheck(slug, projectKey, checkKey);
  if (!check) notFound();

  return <CheckDetailView slug={slug} projectKey={projectKey} check={check} canManage={canManageOrg(membership.role)} />;
}
