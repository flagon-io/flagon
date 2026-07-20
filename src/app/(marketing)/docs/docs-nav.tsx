"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Documentation sidebar: "Documentation" is the
 * standalone home link, sections sit under grouped category labels, and
 * unbuilt sections render disabled. Deliberately no per-page outline here;
 * pages carry their own indexes (the API reference opens with an endpoint
 * index) so the sidebar stays short and nothing wraps.
 */
export type DocsNavModel = {
  groups: {
    label: string;
    items: { label: string; href: string | null }[];
  }[];
};

export function DocsNav({ model }: { model: DocsNavModel }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Documentation"
      className="top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto pr-2 lg:sticky lg:block"
    >
      <Link
        href="/docs"
        className={`block text-xs font-semibold uppercase tracking-[0.2em] transition ${
          pathname === "/docs"
            ? "text-teal-300"
            : "text-teal-400/80 hover:text-teal-300"
        }`}
      >
        Documentation
      </Link>

      {model.groups.map((group) => (
        <div key={group.label} className="mt-7">
          <div className="px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
            {group.label}
          </div>
          <ul className="mt-1.5">
            {group.items.map((item) => {
              if (!item.href) {
                return (
                  <li key={item.label}>
                    <span
                      aria-disabled
                      title="Coming soon"
                      className="flex cursor-not-allowed items-baseline justify-between rounded-md px-3 py-1.5 text-sm text-zinc-600"
                    >
                      {item.label}
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-700">
                        Soon
                      </span>
                    </span>
                  </li>
                );
              }

              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-white/5 font-medium text-zinc-100"
                        : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
