"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { appHref } from "@/lib/urls";

/**
 * The marketing nav, for phones.
 *
 * Below `md` the horizontal nav is hidden, and until now nothing replaced it:
 * Products, Enterprise, Pricing, and Docs were simply unreachable on a phone.
 * Every link the desktop header offers has to exist here too, or the header is
 * decoration.
 *
 * A full-screen panel rather than a dropdown. On a small screen there is no
 * benefit to keeping the page visible behind a menu, and a panel gives targets
 * that are comfortably thumb-sized instead of a cramped list.
 */
export function MobileNav() {
  const pathname = usePathname();
  // Open state is DERIVED from the route: the panel remembers which path it
  // was opened on, so any navigation closes it without an effect. Closing in
  // a useEffect on pathname is the obvious version and it is a cascading
  // render (and a lint error) for something the render pass already knows.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === pathname;
  const close = () => setOpenedAt(null);

  // "Are we on the client yet?" without a setState in an effect: the server
  // snapshot is false, the client snapshot is true, and React swaps them at
  // hydration. document.body does not exist during SSR, so the portal cannot
  // be created until then.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // The page behind must not scroll while the panel is over it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpenedAt(pathname)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {/*
        Portalled to the body, NOT rendered in place. The marketing header
        carries `backdrop-blur`, and a backdrop-filter creates a containing
        block for fixed-position descendants: a `fixed inset-0` panel rendered
        inside it is clipped to the header's own box, so the menu appeared as a
        sliver with the page still scrolling behind it. Nothing about the CSS
        on the panel is wrong; it just has to escape that ancestor.
      */}
      {open && mounted
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
          className="fixed inset-0 z-50 flex flex-col bg-[#09090b]"
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-4">
            {/* Same mark and spacing as the site header, so opening the menu
                reads as the header expanding rather than as a different page
                sliding over it. */}
            <Link
              href="/"
              className="flex items-center gap-2.5"
              onClick={close}
            >
              <FlagonMark className="h-7 w-7" />
              <span className="text-[15px] font-semibold tracking-tight text-zinc-100">
                {brand.name}
              </span>
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-6">
            <ul className="space-y-1">
              {brand.nav.map((item) =>
                item.href ? (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      onClick={close}
                      className="flex items-center justify-between border-b border-white/5 py-4 text-lg font-medium text-zinc-200 transition hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ) : null,
              )}
            </ul>

            <div className="mt-8 space-y-3">
              <Link
                href={appHref("/new?plan=free")}
                onClick={close}
                className="block rounded-md bg-teal-500 px-5 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-teal-400"
              >
                Start for free
              </Link>
              <Link
                href={appHref("/signin")}
                onClick={close}
                className="block rounded-md border border-white/10 px-5 py-3 text-center text-sm font-semibold text-zinc-300 transition hover:border-white/20 hover:text-zinc-100"
              >
                Sign in
              </Link>
            </div>
          </nav>
        </div>,
        document.body,
          )
        : null}
    </div>
  );
}
