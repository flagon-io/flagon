"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, Plus, Check, ChevronRight, ChevronLeft, PanelLeft } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
  Badge,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  cn,
} from "@flagon-io/ui";
import { Logo } from "@/components/logo";
import { Topbar } from "./topbar";
import { CommandMenu } from "./command-menu";
import { orgNav, orgSection, breadcrumbTrail, matches, type NavLink, type OrgSection } from "./nav";
import { BreadcrumbProvider, type DynamicCrumb } from "./page-breadcrumb";
import type { ShellOrg, ShellUser } from "./types";
import { AgentProvider } from "@/components/agent/agent-provider";
import { AgentPanel } from "@/components/agent/agent-panel";
import { AskAiButton } from "@/components/agent/ask-ai-button";

export type { ShellOrg, ShellUser } from "./types";

export function AppShell({
  org,
  orgs,
  user,
  defaultSidebarOpen = true,
  children,
}: {
  org: ShellOrg;
  orgs: ShellOrg[];
  user: ShellUser;
  defaultSidebarOpen?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const navTrail = breadcrumbTrail(org.slug, pathname);

  // A detail page can contribute a trailing crumb with a human label the path
  // can't give (a team/project name), via <PageBreadcrumb>. It registers on mount
  // and clears on unmount, so navigating away drops it - no stale name lingers.
  const [dynamicCrumb, setDynamicCrumb] = useState<DynamicCrumb>(null);
  const setCrumb = useCallback((crumb: DynamicCrumb) => setDynamicCrumb(crumb), []);
  const trail =
    dynamicCrumb && navTrail.length > 0
      ? [...navTrail, { label: dynamicCrumb.label, href: pathname }]
      : navTrail;

  return (
    <AgentProvider orgId={org.id}>
      <SidebarProvider defaultOpen={defaultSidebarOpen} className="h-svh overflow-hidden">
        {/* Icon-collapsible (rail): the footer toggle collapses it to an icon
         * rail rather than hiding it entirely. */}
        <Sidebar collapsible="icon">
          {/* Same height + bottom border as the topbar, so the two connect. */}
          <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
            <OrgSwitcher org={org} orgs={orgs} />
          </SidebarHeader>

          <SidebarContent className="pt-2">
            <CommandMenu slug={org.slug} />
            <SidebarNav slug={org.slug} pathname={pathname} />
          </SidebarContent>

          {/* Collapse control, pinned to the bottom with a top border. The icon
           * flips horizontally to point the other way when collapsed. */}
          <SidebarFooter className="border-t border-sidebar-border p-2">
            <CollapseToggle />
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-w-0">
          <Topbar
            user={user}
            actions={<AskAiButton />}
            left={<SidebarTrigger className="-ml-1 md:hidden" />}
            center={
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                <Link
                  href={`/${org.slug}`}
                  className="truncate font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {org.name}
                </Link>
                {trail.map((crumb, i) => {
                  const isLast = i === trail.length - 1;
                  return (
                    <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                      <span className="shrink-0 text-muted-foreground/40" aria-hidden>
                        /
                      </span>
                      {isLast ? (
                        <span className="truncate font-medium text-foreground">{crumb.label}</span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="truncate font-medium text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {crumb.label}
                        </Link>
                      )}
                    </span>
                  );
                })}
              </nav>
            }
          />
          {/* Full-bleed: pages own their padding via <PageHeader>/<PageBody> so
              headings can span the full width (border included) while content sits
              in a narrower column. The breadcrumb above handles "back". */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BreadcrumbProvider value={setCrumb}>{children}</BreadcrumbProvider>
          </div>
        </SidebarInset>

        {/* Full-height right dock, spanning the whole layout (beside the sidebar
         * and topbar), so the assistant is attached to the app, not tucked under
         * the content. */}
        <AgentPanel />
      </SidebarProvider>
    </AgentProvider>
  );
}

function SidebarNav({ slug, pathname }: { slug: string; pathname: string }) {
  const section = orgSection(slug, pathname);
  // Key the view so React remounts (replaying the fade) only when we cross between
  // the main nav and a sub-nav - not when moving between links within one level.
  // Subtle opacity settle, matching the polish of switching in/out of sub-navs.
  const view = section ? `section:${section.title}` : "main";
  return (
    <div key={view} className="animate-fade-in">
      {section ? (
        <SectionNav section={section} pathname={pathname} />
      ) : (
        <MainNav groups={orgNav(slug)} pathname={pathname} />
      )}
    </div>
  );
}

// Shared link style. Icons inherit the text color (lucide uses currentColor), so
// muting the text mutes the icon - gray when inactive, bright when active.
function navLinkClasses(active: boolean) {
  return cn(
    "flex h-9 items-center gap-2.5 rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    // Collapsed (icon rail): center the icon, drop the horizontal padding.
    "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );
}

// Hidden in the collapsed icon rail (labels, chevrons, badges).
const collapseHidden = "group-data-[collapsible=icon]:hidden";

function MainNav({ groups, pathname }: { groups: NavLink[][]; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  return (
    <div className="px-2">
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="mx-1 my-2 h-px bg-sidebar-border" />}
          <nav className="space-y-0.5">
            {group.map((item) => {
              const Icon = item.icon;
              if (item.disabled) {
                // Not-yet-shipped area: shown for wayfinding but inert.
                return (
                  <div
                    key={item.href}
                    title={`${item.label} - coming soon`}
                    aria-disabled="true"
                    className={cn(
                      navLinkClasses(false),
                      "cursor-not-allowed opacity-45 hover:bg-transparent",
                    )}
                  >
                    {Icon && <Icon className="size-4.5 shrink-0" />}
                    <span className={cn("flex-1 truncate", collapseHidden)}>{item.label}</span>
                    <Badge variant="outline" className={collapseHidden}>
                      Soon
                    </Badge>
                  </div>
                );
              }
              const active = matches(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  title={item.label}
                  aria-current={active ? "page" : undefined}
                  className={navLinkClasses(active)}
                >
                  {Icon && <Icon className="size-4.5 shrink-0" />}
                  <span className={cn("flex-1 truncate", collapseHidden)}>{item.label}</span>
                  {item.section && (
                    <ChevronRight className={cn("size-4 shrink-0 opacity-50", collapseHidden)} />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </div>
  );
}

function SectionNav({ section, pathname }: { section: OrgSection; pathname: string }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  return (
    <div className="px-2">
      {/* The whole header is the back link; chevron left, title centered. When
       * collapsed, the chevron goes static so it centers on its own. */}
      <Link
        href={section.backHref}
        onClick={close}
        title={`Back to ${section.title}`}
        className="relative mb-1 flex h-9 items-center justify-center rounded-md text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent/50 focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <ChevronLeft className="absolute left-2 size-4 opacity-60 group-data-[collapsible=icon]:static group-data-[collapsible=icon]:left-auto" />
        <span className={cn("text-sm font-semibold", collapseHidden)}>{section.title}</span>
      </Link>

      <nav className="space-y-4">
        {section.groups.map((group, gi) => (
          <div key={group.label ?? gi} className="space-y-0.5">
            {group.label && (
              <p
                className={cn(
                  "px-2 pt-1 pb-0.5 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase",
                  collapseHidden,
                )}
              >
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              if (item.disabled) {
            // Not-yet-shipped area: shown for wayfinding (GitHub-style) but inert.
            return (
              <div
                key={item.href}
                title={`${item.label} - coming soon`}
                aria-disabled="true"
                className={cn(navLinkClasses(false), "cursor-not-allowed opacity-45 hover:bg-transparent")}
              >
                {Icon && <Icon className="size-4.5 shrink-0" />}
                <span className={cn("flex-1 truncate", collapseHidden)}>{item.label}</span>
                <Badge variant="outline" className={collapseHidden}>
                  Soon
                </Badge>
              </div>
            );
          }
          const active = matches(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={navLinkClasses(active)}
            >
              {Icon && <Icon className="size-4.5 shrink-0" />}
              <span className={cn("flex-1 truncate", collapseHidden)}>{item.label}</span>
              {item.badge && (
                <Badge variant="brand" className={collapseHidden}>
                  {item.badge}
                </Badge>
              )}
            </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}

function CollapseToggle() {
  const { toggleSidebar, state } = useSidebar();
  const collapsed = state === "collapsed";
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="flex h-8 w-full items-center rounded-md px-2 text-sidebar-foreground/60 outline-none transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
    >
      <PanelLeft className="size-4.5 shrink-0 transition-transform group-data-[collapsible=icon]:-scale-x-100" />
    </button>
  );
}

function OrgSwitcher({ org, orgs }: { org: ShellOrg; orgs: ShellOrg[] }) {
  return (
    <div className="flex w-full items-center gap-1">
      {/* The name links to the org root; only the chevron opens the switcher. */}
      <Link
        href={`/${org.slug}`}
        title={org.name}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/15">
          <Logo className="size-4" />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground",
            collapseHidden,
          )}
        >
          {org.name}
        </span>
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-foreground",
            collapseHidden,
          )}
          aria-label="Switch organization"
        >
          <ChevronsUpDown className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {orgs.map((o) => (
            <DropdownMenuItem key={o.id} asChild>
              <Link href={`/${o.slug}`}>
                <span className="flex-1 truncate">{o.name}</span>
                {o.id === org.id && <Check className="text-brand" />}
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/new">
              <Plus />
              <span>Create organization</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
