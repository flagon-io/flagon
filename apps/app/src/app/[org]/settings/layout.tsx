import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";

/**
 * Organization settings frame. Sits inside the workspace shell, which already
 * provides the header and the settings sub-nav (the sidebar drills into a
 * Settings area). Membership is re-checked here; individual pages further gate
 * write actions by role.
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

  return <>{children}</>;
}
