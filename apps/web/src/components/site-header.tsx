import Link from "next/link";
import { brand, Cta, FlagonMark } from "@flagon/design";
import { APP_URL, SIGN_IN_URL, SIGN_UP_URL } from "@/lib/urls";
import { getMarketingSession } from "@/lib/session";
import { AccountMenu } from "@/components/account-menu";

/**
 * The top-level sections the marketing site will grow into. Items without an
 * `href` render as inert, clearly-disabled labels so the nav's final shape is
 * visible before those pages exist; each becomes a real link as it ships.
 */
const NAV_ITEMS: readonly {
  label: string;
  href?: string;
  external?: boolean;
  /** Render inert with a "Soon" badge (a surface we are building toward). */
  soon?: boolean;
}[] = [
  { label: "Products", soon: true },
  { label: "Pricing", href: "/pricing" },
  { label: "Enterprise", soon: true },
  { label: "Docs", href: "/docs" },
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
            <FlagonMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">
              {brand.name}
            </span>
          </Link>
          <nav className="hidden items-center gap-6 md:flex">
            {NAV_ITEMS.map((item) =>
              item.href && item.external ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100"
                >
                  {item.label}
                </a>
              ) : item.href ? (
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
                  className="flex cursor-not-allowed items-center gap-1.5 text-sm font-medium text-zinc-500 select-none"
                >
                  {item.label}
                  {item.soon ? (
                    <span className="rounded border border-white/15 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-zinc-500 uppercase">
                      Soon
                    </span>
                  ) : null}
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
              <Cta variant="primary" size="sm" href={SIGN_UP_URL}>
                Get started
              </Cta>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
