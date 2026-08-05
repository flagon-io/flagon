"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActivePath } from "@/components/nav-items";

/**
 * The desktop marketing nav. A client component purely so it can read the
 * current pathname and mark the active section; the header itself stays a
 * server component. Mirrors the mobile menu's active treatment.
 */
export function MarketingNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-6 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        if (item.href) {
          const className = active
            ? "text-sm font-medium text-zinc-100"
            : "text-sm font-medium text-zinc-300 transition-colors hover:text-zinc-100";
          return item.external ? (
            <a key={item.label} href={item.href} className={className}>
              {item.label}
            </a>
          ) : (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={className}
            >
              {item.label}
            </Link>
          );
        }
        return (
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
        );
      })}
    </nav>
  );
}
