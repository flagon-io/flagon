"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, BookText, Rocket, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@flagon-io/ui";

type Tab = {
  label: string;
  href: string;
  icon: LucideIcon;
  active?: (pathname: string) => boolean;
  soon?: boolean;
};

// ProjectTabs is the repository-style nav under the project header (GitHub repo
// tabs): links that switch route with an active underline meeting the header's
// bottom border. Not-yet-built areas show disabled with a "Soon" tag, so the
// direction is visible. Settings only shows for members who can edit.
export function ProjectTabs({ base, canManage }: { base: string; canManage: boolean }) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    {
      label: "Overview",
      href: base,
      icon: BookText,
      // Overview owns the README view and its editor.
      active: (p) => p === base || p.startsWith(`${base}/edit`),
    },
    { label: "Deployments", href: `${base}/deployments`, icon: Rocket, soon: true },
    { label: "Activity", href: `${base}/activity`, icon: Activity, soon: true },
  ];
  if (canManage) {
    tabs.push({
      label: "Settings",
      href: `${base}/settings`,
      icon: Settings,
      active: (p) => p.startsWith(`${base}/settings`),
    });
  }

  return (
    <nav className="-mb-px flex gap-1" aria-label="Project">
      {tabs.map((t) => {
        const Icon = t.icon;
        if (t.soon) {
          return (
            <span
              key={t.href}
              title={`${t.label} - coming soon`}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground/50"
            >
              <Icon className="size-4" />
              {t.label}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Soon
              </span>
            </span>
          );
        }
        const active = t.active?.(pathname) ?? false;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors",
              active
                ? "border-brand font-semibold text-foreground"
                : "border-transparent font-medium text-muted-foreground hover:border-hairline hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-foreground" : "text-muted-foreground")} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
