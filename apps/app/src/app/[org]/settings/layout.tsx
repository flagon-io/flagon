import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug } from "@/lib/org";

/**
 * Organization settings frame. Settings is OWNER/ADMIN only (GitHub-style):
 * members manage their org membership from the top-level Members area, not here,
 * so a non-manager is bounced to the org home. Individual pages still gate their
 * write actions by role on top of this.
 */
export default async function OrgSettingsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();
  if (!canManageOrg(membership.role)) redirect(`/${slug}`);

  return <>{children}</>;
}
