"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Slash, buttonClasses } from "@/components/button";
import { site, isNavGroup } from "@/lib/site";

/**
 * Small-screen navigation: an accessible disclosure. The button owns
 * aria-expanded/aria-controls; the panel closes on Escape, on navigation, and
 * on outside click; focus moves to the panel on open and returns to the button
 * on close.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close when the route changes (a link was followed). Adjusting state during
  // render on a changed value is the sanctioned pattern, no effect needed.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Escape to close, and move focus into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();

    // Lock the page behind the menu so it doesn't scroll under the overlay.
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      root.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2} />
        ) : (
          <Menu className="h-5 w-5" strokeWidth={2} />
        )}
      </button>

      <div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b border-hairline bg-background shadow-xl shadow-black/30"
      >
        <nav
          aria-label="Mobile"
          className="mx-auto flex w-full max-w-7xl flex-col gap-0.5 px-6 py-4"
        >
          <div className="mb-3 border-b border-hairline pb-4">
            <Link
              href="/careers"
              onClick={() => setOpen(false)}
              className={buttonClasses({ variant: "default", className: "w-full" })}
            >
              <Slash />
              Careers
            </Link>
          </div>
          {site.nav.map((item) => {
            if (isNavGroup(item)) {
              return (
                <div key={item.label} className="mt-3 first:mt-0">
                  <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-widest text-subtle">
                    {item.label}
                  </p>
                  {item.sections.flat().map((sub) =>
                    sub.external ? (
                      <a
                        key={sub.href}
                        href={sub.href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setOpen(false)}
                        className="block rounded-md px-2 py-2.5 text-sm text-muted-foreground outline-none transition hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        {sub.label}
                      </a>
                    ) : (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        aria-current={pathname === sub.href ? "page" : undefined}
                        onClick={() => setOpen(false)}
                        className="block rounded-md px-2 py-2.5 text-sm text-muted-foreground outline-none transition hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                      >
                        {sub.label}
                      </Link>
                    ),
                  )}
                </div>
              );
            }
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm text-muted-foreground outline-none transition hover:bg-panel hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
