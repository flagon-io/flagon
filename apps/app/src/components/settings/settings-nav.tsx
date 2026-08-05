"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };
export type NavSection = { heading?: string; items: NavItem[] };

/**
 * The settings sidebar, GitHub-style: items are grouped into sections, each with
 * an optional muted heading (the first, untitled section is the account basics;
 * later ones name a domain like "Access" or "Developer settings"). Highlights the
 * item matching the current path (exact match, so a parent does not stay lit on
 * its children).
 */
export function SettingsNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.heading ?? `section-${i}`} className="flex flex-col gap-0.5">
          {section.heading ? (
            <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              {section.heading}
            </p>
          ) : null}
          {section.items.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "bg-white/8 font-medium text-zinc-100"
                    : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
