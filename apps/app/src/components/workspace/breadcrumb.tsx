"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

/**
 * The persistent workspace breadcrumb — one consistent trail in the header on every page,
 * replacing the per-page "← Back" links.
 *
 * By DEFAULT it derives the trail from the URL (so a page needs no wiring at all). A page
 * that wants nicer labels than the raw path segments — a real entity name on a `[key]`/`[id]`
 * route — renders `<SetBreadcrumb items={[...]} />` to OVERRIDE the derived trail while it's
 * mounted. The provider lives in the org layout so the header (which reads the trail) and the
 * page content (which may set it) share one state.
 */

export type Crumb = { label: string; href?: string };

const Ctx = createContext<{ setItems: (items: Crumb[] | null) => void; items: Crumb[] | null } | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Crumb[] | null>(null);
  return <Ctx.Provider value={{ items, setItems }}>{children}</Ctx.Provider>;
}

/** Override the derived breadcrumb from a page (server or client). Clears on unmount. */
export function SetBreadcrumb({ items }: { items: Crumb[] }) {
  const ctx = useContext(Ctx);
  const key = JSON.stringify(items);
  useEffect(() => {
    ctx?.setItems(items);
    return () => ctx?.setItems(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

// Nice labels for known route segments; anything else is humanized (kebab -> Title Case).
const LABELS: Record<string, string> = {
  checks: "Checks",
  "alert-channels": "Alert channels",
  maintenance: "Maintenance windows",
  "status-pages": "Status pages",
  incidents: "Incidents",
  runbooks: "Runbooks",
  "rcca-template": "RCCA template",
  uptime: "Uptime",
  flags: "Feature flags",
  segments: "Segments",
  keys: "Client keys",
  archive: "Archive",
  experiments: "Experiments",
  metrics: "Metrics",
  holdouts: "Holdouts",
  projects: "Projects",
  relationships: "Relationships",
  teams: "Teams",
  members: "Members",
  usage: "Usage",
  settings: "Settings",
  integrations: "Integrations",
  billing: "Billing",
  security: "Security",
  invitations: "Invitations",
  new: "New",
  edit: "Edit",
  // Acronym check/route segments so they don't render as "Url"/"Api".
  url: "URL",
  api: "API",
  dns: "DNS",
  ssl: "SSL",
  tcp: "TCP",
  sms: "SMS",
  rcca: "RCCA",
};

function humanize(seg: string): string {
  return LABELS[seg] ?? seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Trail from the path, skipping the leading org segment (the sidebar already shows the org). */
function derive(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return []; // the org dashboard itself needs no breadcrumb
  const org = parts[0];
  let acc = `/${org}`;
  const crumbs: Crumb[] = [];
  for (let i = 1; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    crumbs.push({ label: humanize(parts[i]), href: acc });
  }
  return crumbs;
}

export function Breadcrumb() {
  const ctx = useContext(Ctx);
  const pathname = usePathname();
  const items = ctx?.items ?? derive(pathname ?? "");
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-zinc-600" /> : null}
            {c.href && !last ? (
              <Link href={c.href} className="truncate text-zinc-400 transition-colors hover:text-zinc-200">
                {c.label}
              </Link>
            ) : (
              <span className={`truncate ${last ? "font-medium text-zinc-100" : "text-zinc-400"}`}>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
