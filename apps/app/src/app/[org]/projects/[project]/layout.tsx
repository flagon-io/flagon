import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import { getProject } from "@/lib/projects-api";

/**
 * Project frame. The workspace shell already provides the header and the project
 * sub-nav (the sidebar drills into a per-project area). Membership + project
 * existence are re-checked here; individual pages further gate by role.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: slug, project: key } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) redirect("/");
  const project = await getProject(slug, key);
  if (!project) notFound();

  return <>{children}</>;
}
