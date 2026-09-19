"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@flagon-io/ui";

// ProjectSettingsNav is the sub-navigation within a project's Settings area
// (General, Access, and deploy/env settings as they land). A left rail on wide
// screens, a horizontal strip on narrow ones.
export function ProjectSettingsNav({ base }: { base: string }) {
  const pathname = usePathname();
  const items = [
    { label: "General", href: `${base}/settings` },
    { label: "Access", href: `${base}/settings/access` },
  ];
  return (
    <nav aria-label="Project settings" className="flex gap-1 sm:flex-col sm:gap-0.5">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-panel font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:bg-panel/60 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
