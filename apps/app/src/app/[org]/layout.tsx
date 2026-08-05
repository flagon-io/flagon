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
import { SsoRequired } from "@/components/workspace/sso-required";
import { TwoFactorRequired } from "@/components/workspace/two-factor-required";
import {
  getOrgSecurity,
  hasActiveSsoSession,
  ssoBlocks,
  twoFactorBlocks,
} from "@/lib/org-security";

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

  // membership + orgs both depend only on the user id — run them in parallel
  // (and they're React-cached, so a page re-reading them hits no DB again).
  const [membership, orgs, cookieStore] = await Promise.all([
    getMembershipBySlug(session.user.id, slug),
    getUserOrganizations(session.user.id),
    cookies(),
  ]);
  if (!membership) notFound();

  // Security posture (GitHub-style). A member of an SSO-enforced org must hold an
  // active SSO session, and a member of a require-2fa org must have 2FA enrolled,
  // before the org's resources render. The OWNER is never gated (keeps a
  // fallback so a misconfigured IdP or lost authenticator can't lock the org
  // out). Resolve to a single gate element; SSO takes precedence over 2FA.
  const security = await getOrgSecurity(membership.id);
  const role = membership.role;
  let gate: ReactNode = null;
  if (security?.ssoEnforced && role !== "owner") {
    const hasSession = await hasActiveSsoSession(membership.id, session.user.id);
    if (ssoBlocks({ ssoEnforced: true, role, hasSession })) {
      gate = <SsoRequired slug={slug} orgName={membership.name} />;
    }
  }
  if (
    !gate &&
    twoFactorBlocks({
      require2fa: security?.require2fa ?? false,
      role,
      twoFactorEnabled: session.user.twoFactorEnabled ?? false,
    })
  ) {
    gate = <TwoFactorRequired orgName={membership.name} />;
  }

  const initialCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "1";

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
            <div className="mx-auto w-full max-w-7xl">
              {gate ??
                (isOrgLocked(membership) ? (
                  <OrgLocked
                    slug={slug}
                    canManage={canManageOrg(membership.role)}
                    status={membership.subscriptionStatus}
                  />
                ) : (
                  children
                ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
