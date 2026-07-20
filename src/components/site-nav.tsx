"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/lib/brand";

/**
 * Marketing nav with the current page highlighted (white) against muted
 * siblings. Disabled entries render until their pages exist.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {brand.nav.map((item) =>
        item.href ? (
          <Link
            key={item.label}
            href={item.href}
            aria-current={
              pathname.startsWith(item.href.split("/").slice(0, 2).join("/"))
                ? "page"
                : undefined
            }
            className={`rounded-md px-3 py-2 text-sm transition ${
              pathname.startsWith(item.href.split("/").slice(0, 2).join("/"))
                ? "font-medium text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.label}
            aria-disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-zinc-500"
          >
            {item.label}
          </span>
        ),
      )}
    </nav>
  );
}
