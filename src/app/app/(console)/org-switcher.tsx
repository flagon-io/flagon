"use client";

import { appPath } from "@/lib/urls";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { FlagonMark } from "@/lib/logo";
import { PLANS, isPlanId } from "@/lib/plans";
import { currentOrgSlug } from "./sidebar-nav";

export type SwitcherOrg = {
  id: string;
  slug: string;
  name: string;
  plan: string;
};

function planName(plan: string): string {
  return isPlanId(plan) ? PLANS[plan].name : plan;
}

/**
 * Vercel-style organization switcher at the top of the app sidebar: current
 * org + plan chip, dropdown with every org, and the create flow. Switching
 * sets the active organization on the session before navigating.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: SwitcherOrg[];
  activeOrgId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Prefer the org named in the URL so the switcher always reflects the page
  // being viewed, then the session's active org, then anything at all.
  const fallback =
    orgs.find((org) => org.id === activeOrgId)?.slug ?? orgs[0]?.slug ?? null;
  const slug = currentOrgSlug(
    pathname,
    orgs.map((org) => org.slug),
    fallback,
  );
  const active = orgs.find((org) => org.slug === slug) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function switchTo(org: SwitcherOrg) {
    setOpen(false);
    if (org.id === active?.id) return;
    setPending(true);
    try {
      await authClient.organization.setActive({ organizationId: org.id });
      router.push(appPath(`/${org.slug}`));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={containerRef} className="relative flex w-full items-center gap-1">
      {/* Navigation target: the org identity itself links to the org's
          baseline page, so getting "home" never requires opening the menu. */}
      <Link
        href={active ? appPath(`/${active.slug}`) : appPath("/")}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-white/5"
      >
        <FlagonMark className="h-6 w-6 shrink-0" />
        {active ? (
          <>
            <span className="truncate text-sm font-semibold text-zinc-100">
              {active.name}
            </span>
            <span className="shrink-0 rounded-full border border-teal-500/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-teal-300">
              {planName(active.plan)}
            </span>
          </>
        ) : (
          <span className="truncate text-sm font-semibold text-zinc-100">
            Flagon
          </span>
        )}
      </Link>

      {/* Switcher target: only the chevron opens the menu. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch organization"
        disabled={pending}
        className="shrink-0 rounded-md p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
      >
        <ChevronsUpDown className="h-4 w-4" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-white/10 bg-[#111113] p-1 shadow-xl shadow-black/40"
        >
          {orgs.length ? (
            <>
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
                Organizations
              </div>
              {orgs.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="menuitem"
                  onClick={() => switchTo(org)}
                  className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
                >
                  <span className="truncate">{org.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-600">
                      {planName(org.plan)}
                    </span>
                    {org.id === active?.id ? (
                      <Check className="h-3.5 w-3.5 text-teal-400" aria-hidden />
                    ) : null}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t border-white/5" />
            </>
          ) : null}
          <Link
            href={appPath("/new")}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100"
          >
            <Plus className="h-4 w-4 text-zinc-500" aria-hidden />
            Create organization
          </Link>
        </div>
      ) : null}
    </div>
  );
}
