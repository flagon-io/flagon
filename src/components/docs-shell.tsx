import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { MobileSidebar } from "@/components/sidebar";
import { ScrollReset } from "@/components/scroll-reset";
import { site } from "@/lib/site";

/**
 * Docs shell, shared by the handbook and the books. Below the header, a
 * viewport-tall region laid out as a column: a two-pane grid (nav + content,
 * each its OWN scroll container so they never share a scrollbar) above a slim,
 * full-width footer bar that spans under both panes. The big marketing footer
 * would get boxed into the content pane here, so doc pages get this compact bar
 * instead. On small screens it all collapses to normal page flow.
 */
export function DocsShell({
  sidebar,
  toggleLabel,
  tools,
  children,
}: {
  /** Controls that apply to every page, pinned above the nav (and beside the
   * mobile nav button), e.g. a book's reading depth. */
  tools?: ReactNode;
  /** The nav, rendered both in the desktop rail and the mobile dropdown. */
  sidebar: ReactNode;
  /** The mobile dropdown's button label, e.g. "Browse the handbook". */
  toggleLabel: string;
  children: ReactNode;
}) {
  const year = new Date().getFullYear();

  return (
    <div className="relative flex flex-1 flex-col">
      <a
        href="#content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-3 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>

      <SiteHeader />

      <div className="mx-auto w-full max-w-7xl border-x border-hairline lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-hidden">
        <div className="grid grid-cols-1 lg:min-h-0 lg:flex-1 lg:grid-cols-[276px_minmax(0,1fr)] lg:overflow-hidden">
          {/* Mobile: a nav bar docked under the header while the page scrolls. */}
          <MobileSidebar toggleLabel={toggleLabel} tools={tools}>
            {sidebar}
          </MobileSidebar>

          {/* Left rail: own scroll, shown inline from lg up. */}
          <aside className="hidden border-hairline lg:block lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:pb-6 lg:pt-0">
            {tools ? (
              <div className="sticky top-0 z-10 border-b border-hairline bg-background px-4 py-3">{tools}</div>
            ) : null}
            {sidebar}
          </aside>

          {/* Content: own scroll on desktop. */}
          <div
            id="content"
            tabIndex={-1}
            className="min-w-0 outline-none lg:h-full lg:overflow-y-auto"
          >
            <ScrollReset targetId="content" />
            <div className="px-6 py-10 sm:px-8">{children}</div>
          </div>
        </div>

        {/* Slim footer bar, full width across both panes. */}
        <footer className="border-t border-hairline">
          <div className="flex flex-col items-center gap-2 px-6 py-4 font-mono text-[11px] uppercase tracking-widest text-subtle sm:flex-row sm:justify-between sm:px-8">
            <p>
              © {year} {site.legalName}
            </p>
            <p>Built in public · {site.domain}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
