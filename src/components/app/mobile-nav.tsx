'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import {
  SidebarFooter,
  SidebarHeaderContent,
  SidebarNav,
  type NavFooterItem,
  type NavSection,
  type SidebarHeaderProps,
} from '@/components/app/app-sidebar';

/**
 * Mobile app-shell navigation: a hamburger (shown in the topbar below `md`) that
 * opens a slide-in drawer with the same org switcher + grouped nav as the desktop
 * sidebar. Closes on route change (covers nav links and org switch), Escape, and
 * backdrop tap.
 */
export function MobileNav({
  sections,
  footer,
  orgs,
  activeSlug,
  brandHref,
  badge,
}: { sections: NavSection[]; footer?: NavFooterItem[] } & SidebarHeaderProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);
  // Close whenever the route changes (nav link tapped, or org switched).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="-ml-1 grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-card-muted hover:text-foreground md:hidden"
      >
        <Menu className="size-5" />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-100 md:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <aside
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-xl"
              style={{ animation: 'flagon-slide-in 0.18s ease-out' }}
            >
              <div className="flex h-14 items-center gap-2 border-b border-border pl-2.5 pr-2">
                <div className="min-w-0 flex-1">
                  <SidebarHeaderContent orgs={orgs} activeSlug={activeSlug} brandHref={brandHref} badge={badge} />
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="grid size-9 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-card-muted hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav sections={sections} />
              <SidebarFooter footer={footer} />
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
