"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, buttonClasses } from "@flagon-io/ui";
import uiPkg from "@flagon-io/ui/package.json";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { components, componentsByCategory } from "@/components/docs/registry";
import { ThemeSelect } from "@/components/docs/ui-theme";

const gettingStarted = [
  { label: "Introduction", href: "/ui" },
  { label: "Installation", href: "/ui/installation" },
  { label: "Theming", href: "/ui/theming" },
  { label: "Components", href: "/ui/components" },
];

/** The Flagon UI docs shell (header, nav, sidebar). Client-only (it reads the
 * active pathname); the Brand is applied by the server layout that wraps this. */
export function UiDocsChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      {/* Fonts the demo Brands approximate their (proprietary) typefaces with. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Docs-only demo fonts for the Brand presets; page-scoped is intentional. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap"
        rel="stylesheet"
      />
      <div className="min-h-dvh bg-background">
        <header className="sticky top-0 z-30 border-b border-hairline bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:px-6">
            <Link href="/ui" className="flex items-center gap-2 font-semibold text-foreground">
              <Logo className="size-5" />
              <span>
                Flagon <span className="text-muted-foreground">UI</span>
              </span>
            </Link>
            <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              v{uiPkg.version}
            </span>
            <nav className="ml-4 hidden items-center gap-0.5 md:flex lg:ml-6">
              {gettingStarted.map((item) => {
                const active =
                  item.href === "/ui" ? pathname === "/ui" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <ThemeSelect />
              <ThemeToggle />
              <a
                href="https://github.com/flagon-io/flagon"
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "outline", size: "sm" })}
              >
                GitHub ↗
              </a>
            </div>
          </div>
        </header>

        {/* Mobile nav: the sidebar is hidden below md, so surface the same links as
         * a horizontally scrollable strip pinned under the header. */}
        <div className="sticky top-14 z-20 border-b border-hairline bg-background/80 backdrop-blur md:hidden">
          <nav className="flex gap-1 overflow-x-auto px-4 py-2">
            {[...gettingStarted, ...components.map((c) => ({ label: c.name, href: `/ui/components/${c.slug}` }))].map(
              (item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                      active
                        ? "bg-secondary font-medium text-foreground"
                        : "text-muted-foreground hover:bg-panel hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              },
            )}
          </nav>
        </div>

        <div className="mx-auto flex max-w-7xl gap-10 px-4 lg:px-6">
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 overflow-y-auto py-8 md:block">
            <nav className="space-y-6 text-sm">
              <NavGroup label="Getting started">
                {gettingStarted.map((item) => (
                  <NavLink key={item.href} href={item.href} active={pathname === item.href}>
                    {item.label}
                  </NavLink>
                ))}
              </NavGroup>

              {componentsByCategory().map(({ category, items }) => (
                <NavGroup key={category.id} label={category.label}>
                  {items.map((c) => (
                    <NavLink
                      key={c.slug}
                      href={`/ui/components/${c.slug}`}
                      active={pathname === `/ui/components/${c.slug}`}
                      planned={c.status === "planned"}
                    >
                      {c.name}
                    </NavLink>
                  ))}
                </NavGroup>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 flex-1 py-8 lg:py-10">{children}</main>
        </div>
      </div>
    </>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function NavLink({
  href,
  active,
  planned,
  children,
}: {
  href: string;
  active: boolean;
  planned?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
        active
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground hover:bg-panel hover:text-foreground",
      )}
    >
      {/* Planned items read at full muted contrast; the trailing dot (not a dimmer
       * color) is what marks them as planned, so they stay legible (WCAG AA). */}
      <span className="truncate">{children}</span>
      {planned && (
        <span
          title="Planned"
          className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
          aria-label="planned"
        />
      )}
    </Link>
  );
}
