import Link from "next/link";
import { brand, Cta, FlagonMark } from "@flagon/design";
import { APP_URL, SIGN_IN_URL } from "@/lib/urls";
import { getMarketingSession } from "@/lib/session";
import { AccountMenu } from "@/components/account-menu";

/**
 * The top-level sections the marketing site will grow into. Items without an
 * `href` render as inert, clearly-disabled labels so the nav's final shape is
 * visible before those pages exist; each becomes a real link as it ships.
 */
const NAV_ITEMS: readonly { label: string; href?: string }[] = [
  { label: "Products" },
  { label: "Resources" },
  { label: "Enterprise" },
  { label: "Pricing", href: "/pricing" },
];

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
            <FlagonMark className="h-7 w-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  key={item.label}
                  aria-disabled="true"
                  title="Coming soon"
                  className="cursor-not-allowed text-sm font-medium text-zinc-500 select-none"
                >
                  {item.label}
                </span>
              ),
            )}
          </nav>
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
              <Cta variant="secondary" size="sm" href={SIGN_IN_URL}>
                Sign in
              </Cta>
              <Cta variant="primary" size="sm" href="#waitlist">
                Get early access
              </Cta>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
