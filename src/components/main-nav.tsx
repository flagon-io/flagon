"use client";

import type { PointerEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { site, isNavGroup, type NavLink } from "@/lib/site";

/**
 * The desktop top navigation, built on Radix NavigationMenu: direct links plus
 * click/keyboard-openable dropdown groups. Radix owns the a11y contract (roles,
 * aria-expanded, arrow-key roving, Escape, focus that does not jump on hover).
 *
 * Hover-to-open is suppressed so adjacent groups don't fight each other as the
 * pointer crosses them: Radix composes our pointer handlers before its own, so
 * calling preventDefault() on the hover events cancels its open-on-hover while
 * leaving click and keyboard activation untouched.
 */
const preventHover = (e: PointerEvent) => {
  if (e.pointerType === "mouse") e.preventDefault();
};

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <NavigationMenu.Root className={cn("relative", className)} delayDuration={80}>
      <NavigationMenu.List className="flex items-center gap-6">
        {site.nav.map((item) => {
          if (isNavGroup(item)) {
            const active = item.sections
              .flat()
              .some((i) => !i.external && isActive(i.href));
            return (
              <NavigationMenu.Item key={item.label} className="relative">
                <NavigationMenu.Trigger
                  onPointerMove={preventHover}
                  onPointerLeave={preventHover}
                  className={cn(
                    "group flex items-center gap-1 text-sm outline-none transition-colors focus-visible:text-foreground",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
                  )}
                >
                  {item.label}
                  <ChevronDown
                    className="h-3.5 w-3.5 text-subtle transition-transform duration-200 group-data-[state=open]:rotate-180"
                    strokeWidth={2}
                    aria-hidden
                  />
                </NavigationMenu.Trigger>
                <NavigationMenu.Content
                  onPointerEnter={preventHover}
                  onPointerLeave={preventHover}
                  className="absolute left-0 top-full z-30 pt-2.5"
                >
                  <div className="min-w-52 rounded-lg border border-hairline bg-popover p-1.5 shadow-xl shadow-black/10">
                    {item.sections.map((section, si) => (
                      <div
                        key={si}
                        className={cn(si > 0 && "mt-1.5 border-t border-hairline pt-1.5")}
                      >
                        {section.map((link) => (
                          <DropdownLink key={link.href} link={link} active={isActive} />
                        ))}
                      </div>
                    ))}
                  </div>
                </NavigationMenu.Content>
              </NavigationMenu.Item>
            );
          }

          const active = isActive(item.href);
          return (
            <NavigationMenu.Item key={item.href}>
              <NavigationMenu.Link asChild active={active}>
                <Link
                  href={item.href}
                  className={cn(
                    "text-sm outline-none transition-colors focus-visible:text-foreground",
                    active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          );
        })}
      </NavigationMenu.List>
    </NavigationMenu.Root>
  );
}

function DropdownLink({
  link,
  active,
}: {
  link: NavLink;
  active: (href: string) => boolean;
}) {
  const Icon = link.icon;
  const current = !link.external && active(link.href);
  const cls = cn(
    "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-panel hover:text-foreground focus-visible:bg-panel focus-visible:text-foreground",
    current ? "font-medium text-foreground" : "text-muted-foreground",
  );
  const inner = (
    <>
      {Icon ? <Icon className="h-4 w-4 shrink-0 text-subtle" /> : null}
      {link.label}
      {link.external ? (
        <>
          <ArrowUpRight
            className="ml-auto h-4 w-4 shrink-0 text-subtle transition group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-foreground group-focus-visible:text-foreground"
            strokeWidth={2}
            aria-hidden
          />
          <span className="sr-only">(opens in a new tab)</span>
        </>
      ) : null}
    </>
  );

  return (
    <NavigationMenu.Link asChild active={current}>
      {link.external ? (
        <a href={link.href} target="_blank" rel="noreferrer" className={cls}>
          {inner}
        </a>
      ) : (
        <Link href={link.href} aria-current={current ? "page" : undefined} className={cls}>
          {inner}
        </Link>
      )}
    </NavigationMenu.Link>
  );
}
