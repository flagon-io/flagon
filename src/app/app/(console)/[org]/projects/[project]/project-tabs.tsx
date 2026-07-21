"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Lock, Settings, type LucideIcon } from "lucide-react";

/** The app lives at /app/... locally but at the subdomain root in production;
 * normalize both sides so active states match either way. */
function normalize(path: string): string {
  return path.replace(/^\/app(?=\/|$)/, "") || "/";
}

type Tab = {
  label: string;
  icon: LucideIcon;
  /** Project-relative path ("" = overview). Absent = not shipped yet. */
  path?: string;
  exact?: boolean;
};

/**
 * Repository-style tab navigation for a project. Product tabs (feature
 * flags) appear as disabled placeholders until they ship; Settings only
 * shows for project admins.
 */
export function ProjectTabs({
  orgSlug,
  projectSlug,
  canManage,
}: {
  orgSlug: string;
  projectSlug: string;
  canManage: boolean;
}) {
  const pathname = normalize(usePathname());
  const base = `/${orgSlug}/projects/${projectSlug}`;

  const tabs: Tab[] = [
    { label: "Overview", icon: Home, path: "", exact: true },
    { label: "Access", icon: Lock, path: "access" },
    ...(canManage
      ? [{ label: "Settings", icon: Settings, path: "settings" }]
      : []),
  ];

  return (
    <nav
      aria-label="Project"
      className="mt-6 flex gap-1 overflow-x-auto border-b border-white/10"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        if (tab.path === undefined) {
          return (
            <span
              key={tab.label}
              aria-disabled
              title="Coming soon"
              className="flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm text-zinc-600"
            >
              <Icon className="h-4 w-4" aria-hidden />
              {tab.label}
              <span className="text-[10px] uppercase tracking-wider text-zinc-700">
                Soon
              </span>
            </span>
          );
        }

        const target = tab.path ? `${base}/${tab.path}` : base;
        const active = tab.exact
          ? pathname === target
          : pathname === target || pathname.startsWith(`${target}/`);
        return (
          <Link
            key={tab.label}
            href={appPath(`${target}`)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
              active
                ? "border-teal-500 font-medium text-zinc-100"
                : "border-transparent text-zinc-400 hover:border-white/20 hover:text-zinc-200"
            }`}
          >
            <Icon
              className={`h-4 w-4 ${active ? "text-teal-400" : "text-zinc-500"}`}
              aria-hidden
            />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
