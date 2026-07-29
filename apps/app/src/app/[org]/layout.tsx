import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageOrg, getMembershipBySlug, getUserOrganizations } from "@/lib/org";
import { isOrgLocked } from "@/lib/billing";
import {
  WorkspaceSidebar,
  SIDEBAR_COOKIE,
} from "@/components/workspace/workspace-sidebar";
import { WorkspaceTopbar } from "@/components/workspace/workspace-topbar";
import { VerifyEmailBanner } from "@/components/workspace/verify-email-banner";
import { OrgLocked } from "@/components/workspace/org-locked";

/**
 * The workspace app shell for an organization: a fixed left sidebar (org
 * switcher, nav, account) beside a scrolling content column. Membership is
 * guarded by the URL slug (a non-member, or an org that does not exist, gets a
 * 404). The "verify your email" banner rides at the top of the content until the
 * address is confirmed.
 */
export default async function OrgLayout({
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

  const orgs = await getUserOrganizations(session.user.id);
  const initialCollapsed =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  const user = {
    name: session.user.name,
    email: session.user.email,
    username: session.user.username ?? null,
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      <WorkspaceSidebar
        orgs={orgs}
        current={membership}
        initialCollapsed={initialCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceTopbar user={user} />
        {!session.user.emailVerified ? (
          <VerifyEmailBanner email={session.user.email} />
        ) : null}
        <div className="flex-1 overflow-y-auto">
          <main className="px-6 py-8">
            <div className="mx-auto w-full max-w-5xl">
              {isOrgLocked(membership) ? (
                <OrgLocked
                  slug={slug}
                  canManage={canManageOrg(membership.role)}
                  status={membership.subscriptionStatus}
                />
              ) : (
                children
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
