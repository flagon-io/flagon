import Link from "next/link";
import { brand, Cta, FlagonMark } from "@flagon/design";
import { APP_URL, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/urls";
import { getMarketingSession } from "@/lib/session";
import { AccountMenu } from "@/components/account-menu";
import { MarketingNav } from "@/components/marketing-nav";
import { MobileNav } from "@/components/mobile-nav";

/**
 * Marketing header. Login-aware: signed-in visitors get a way straight into the
 * app (so they can switch between the marketing site and the console), while
 * signed-out visitors get sign-in and the waitlist. Auth state is resolved from
 * the shared session cookie via the console (see lib/session).
 */
export async function SiteHeader() {
  const user = await getMarketingSession();

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <FlagonMark className="size-7" />
            <span className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
              {brand.name}
              <span className="rounded border border-teal-400/25 bg-teal-400/10 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-teal-300 uppercase">
                Alpha
              </span>
            </span>
          </Link>
          <MarketingNav />
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <Cta variant="primary" size="sm" href={APP_URL}>
                Open app
              </Cta>
              <AccountMenu user={user} />
            </>
          ) : (
            <>
              <Cta
                variant="secondary"
                size="sm"
                href={SIGN_IN_URL}
                className="hidden sm:inline-flex"
              >
                Sign in
              </Cta>
              <Cta variant="primary" size="sm" href={SIGN_UP_URL}>
                Get started
              </Cta>
            </>
          )}
          <MobileNav signedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  );
}
