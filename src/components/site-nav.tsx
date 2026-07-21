"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { brand } from "@/lib/brand";

/**
 * Marketing nav with the current page highlighted (white) against muted
 * siblings. Every entry points somewhere: nothing here is a placeholder.
 */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {brand.nav.map((item) => (
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
      ))}
    </nav>
  );
}
