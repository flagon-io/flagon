import { appPath, marketingHref } from "@/lib/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ArrowUpRight } from "lucide-react";
import { headerPillClass } from "@/components/form-ui";
import { UserMenu } from "@/components/user-menu";
import { listEmails } from "@/lib/user-emails";
import { OrgSwitcher, type SwitcherOrg } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";
import { MobileConsoleNav } from "./mobile-console-nav";
import { VerifyEmailBanner } from "../verify-email-banner";

/**
 * Signed-in console chrome: fixed left sidebar (org switcher on top, product
 * navigation below) and a slim top bar with the account menu. The session
 * check gates every console page: an anonymous visit to any org/console URL
 * lands on the sign-in form instead. Auth pages live in the sibling (auth)
 * group so they stay reachable.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect(appPath("/signin"));

  const orgs = await auth.api.listOrganizations({ headers: requestHeaders });
  const switcherOrgs: SwitcherOrg[] = orgs.map((org) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    plan: (org as { plan?: string }).plan ?? "free",
  }));
  const activeOrg =
    orgs.find((org) => org.id === session.session.activeOrganizationId) ??
    orgs[0] ??
    null;

  // Unverified primary email: keep the user signed in (no lockouts) but nag
  // persistently until the address is proven.
  const primaryEmail = session.user.emailVerified
    ? null
    : ((await listEmails(session.user.id)).find((e) => e.isPrimary) ?? null);

  return (
    // The console is an application, not a document: the shell pins itself
    // to the viewport (fixed inset-0), the sidebar never moves, and only the
    // content pane scrolls. Fixed positioning makes full-height unconditional
    // - no dependence on ancestor height chains or dvh quirks.
    <div className="fixed inset-0 flex overflow-hidden bg-[#09090b]">
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-white/5 md:flex">
        {/* Same height + border as the top bar so the switcher and account
            menu read as one continuous header band. */}
        <div className="flex h-14 shrink-0 items-center border-b border-white/5 px-2">
          <OrgSwitcher
            orgs={switcherOrgs}
            activeOrgId={activeOrg?.id ?? null}
          />
        </div>
        <SidebarNav
          orgSlugs={switcherOrgs.map((org) => org.slug)}
          fallbackSlug={activeOrg?.slug ?? null}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* h-14 + border on the SAME element as the switcher band next door,
            so both borders land on the same pixel row. */}
        <header className="flex h-14 shrink-0 border-b border-white/5">
          <div className="flex flex-1 items-center justify-between gap-3 px-4 sm:px-6">
            {/* Only below md, where the sidebar is hidden. */}
            <MobileConsoleNav
              orgs={switcherOrgs}
              activeOrgId={activeOrg?.id ?? null}
              orgSlugs={switcherOrgs.map((org) => org.slug)}
              fallbackSlug={activeOrg?.slug ?? null}
            />
            <div className="ml-auto flex items-center">
              <div className="flex items-center gap-3">
                <Link
                  href={marketingHref("/")}
                  className={`${headerPillClass} hidden sm:inline-flex`}
                >
                  Return to site <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
                <UserMenu />
              </div>
            </div>
          </div>
        </header>

        {primaryEmail ? (
          <VerifyEmailBanner
            email={primaryEmail.email}
            emailRowId={primaryEmail.id}
          />
        ) : null}

        {/* No footer in the console: it's an application surface. Legal
            links live in the account menu / marketing pages. Content sits in
            a centered column regardless of how much width it uses. */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
