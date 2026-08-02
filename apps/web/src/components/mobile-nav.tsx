"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { SIGN_IN_URL } from "@/lib/urls";

const NAV_ITEMS = [
  { label: "Products", href: "/products" },
  { label: "Pricing", href: "/pricing" },
  { label: "Enterprise", href: "/enterprise" },
  { label: "Docs", href: "/docs" },
] as const;

/**
 * The marketing header's mobile menu: a hamburger that drops a full-width panel
 * with the nav links (and Sign in for signed-out visitors). Desktop uses the
 * inline nav instead, so this is `md:hidden`.
 */
export function MobileNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-md text-zinc-300 hover:bg-white/5"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 top-16 z-20 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-x-0 top-16 z-30 border-b border-white/10 bg-[#09090b]/95 backdrop-blur">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100"
                >
                  {item.label}
                </Link>
              ))}
              {!signedIn ? (
                <a
                  href={SIGN_IN_URL}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 hover:text-zinc-100"
                >
                  Sign in
                </a>
              ) : null}
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}
