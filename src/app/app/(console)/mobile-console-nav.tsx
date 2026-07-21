"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { OrgSwitcher, type SwitcherOrg } from "./org-switcher";
import { SidebarNav } from "./sidebar-nav";

/**
 * The console sidebar, for phones.
 *
 * The desktop sidebar is `hidden md:flex`, and nothing stood in for it below
 * that breakpoint: on a phone the console had no navigation at all. Not a
 * degraded one, none. No Feature Flags, no Members, no Usage, no Settings, and
 * no way to switch organizations.
 *
 * So this is the same two components the sidebar renders, in a drawer. Not a
 * reduced mobile menu with a hand-picked subset, because a subset is a second
 * navigation model to keep in sync, and the one that gets forgotten is always
 * the one fewer people use.
 */
export function MobileConsoleNav({
  orgs,
  activeOrgId,
  orgSlugs,
  fallbackSlug,
}: {
  orgs: SwitcherOrg[];
  activeOrgId: string | null;
  orgSlugs: string[];
  fallbackSlug: string | null;
}) {
  const pathname = usePathname();
  // Open state is DERIVED from the route: the panel remembers which path it
  // was opened on, so any navigation closes it without an effect. Closing in
  // a useEffect on pathname is the obvious version and it is a cascading
  // render (and a lint error) for something the render pass already knows.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const close = () => setOpenedAt(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenedAt(pathname)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100 md:hidden"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Tapping outside closes it, which is what people try first. */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="absolute inset-0 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Console navigation"
            className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-white/10 bg-[#09090b]"
          >
            <div className="flex h-14 shrink-0 items-center gap-1 border-b border-white/5 px-2">
              <div className="min-w-0 flex-1">
                <OrgSwitcher orgs={orgs} activeOrgId={activeOrgId} />
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close navigation"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <SidebarNav orgSlugs={orgSlugs} fallbackSlug={fallbackSlug} />
          </div>
        </div>
      ) : null}
    </>
  );
}
