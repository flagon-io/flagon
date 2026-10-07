"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/toc";
import { cn } from "@/lib/cn";

/**
 * "On this page" rail. Highlights the section currently in view with an
 * IntersectionObserver, so the reader always knows where they are. Rendered in
 * the right column on wide screens; hidden below xl (see the page layout).
 */
export function Toc({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;

    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 1 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  if (items.length === 0) return null;

  return (
    <nav aria-label="On this page" className="flex flex-col gap-3">
      <p className="font-mono text-[11px] uppercase tracking-widest text-subtle">
        On this page
      </p>
      <ul className="flex flex-col gap-1 border-l border-hairline">
        {items.map((item) => (
          <li key={item.id} data-toc-deep={item.deep ? "" : undefined}>
            <a
              href={`#${item.id}`}
              className={cn(
                "-ml-px block break-words border-l-2 py-1 text-sm transition-colors",
                item.depth === 3 ? "pl-7" : "pl-4",
                activeId === item.id
                  ? "border-brand font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:border-hairline hover:text-foreground",
              )}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
