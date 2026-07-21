import { appPath, marketingHref } from "@/lib/urls";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { ArrowUpRight } from "lucide-react";
import { subtleButtonClass } from "@/components/form-ui";
import { SiteBottomBar } from "@/components/site-bottom-bar";
import { UserMenu } from "@/components/user-menu";
import { listEmails } from "@/lib/user-emails";
import { VerifyEmailBanner } from "../verify-email-banner";

/**
 * Account-level chrome (settings and future personal pages). These pages are
 * about the signed-in user, not any organization, so there is no org
 * switcher or product sidebar: just a plain header and a centered content
 * column, with the console one click away via the brand mark.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(appPath("/signin"));

  // Unverified primary email: keep the user signed in (no lockouts) but nag
  // persistently until the address is proven.
  const primaryEmail = session.user.emailVerified
    ? null
    : ((await listEmails(session.user.id)).find((e) => e.isPrimary) ?? null);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <Link href={appPath("")} className="flex items-center gap-2">
            <FlagonMark className="h-6 w-6" />
            <span className="text-sm font-semibold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <div className="flex items-center gap-3"><Link href={marketingHref("/")} className={`${subtleButtonClass} gap-1.5 text-xs`}>Return to site <ArrowUpRight className="h-3.5 w-3.5" /></Link><UserMenu /></div>
        </div>
      </header>

      {primaryEmail ? (
        <VerifyEmailBanner
          email={primaryEmail.email}
          emailRowId={primaryEmail.id}
        />
      ) : null}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        {children}
      </main>
      <SiteBottomBar />
    </>
  );
}
