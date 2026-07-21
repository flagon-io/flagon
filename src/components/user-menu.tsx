"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Building2, LayoutGrid, LogOut, Settings } from "lucide-react";
import { authClient, useSession } from "@/lib/auth-client";
import { appHref } from "@/lib/urls";
import { headerPillClass } from "@/components/form-ui";

/**
 * Session-aware account control, shared by the marketing header and the
 * console header:
 *
 * - resolving: neutral skeleton (no sign-in flash for signed-in users)
 * - signed out: Sign in / Get started, linking to the app surface
 * - signed in: avatar dropdown (identity, dashboard, settings, sign out)
 *
 * On marketing pages (`showDashboardLink`) a Dashboard button sits next to
 * the avatar: from www, getting into the app is the whole point of being
 * signed in, so it should never be buried in a menu.
 *
 * Session state comes from useSession (client-side /api/auth/get-session), so
 * static marketing pages stay static. The *.flagon.io cookie makes the session
 * visible from www in production; locally everything is one origin anyway.
 */
export function UserMenu({
  showDashboardLink = false,
}: {
  /** Marketing surfaces: surface a direct link into the app. */
  showDashboardLink?: boolean;
} = {}) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (isPending) {
    return (
      <div
        aria-hidden
        className="h-8 w-8 animate-pulse rounded-full bg-white/10"
      />
    );
  }

  if (!session) {
    return (
      <div className="flex items-center gap-1">
        <Link
          href={appHref("/signin")}
          className="rounded-md px-3 py-2 text-sm text-zinc-300 transition hover:text-zinc-100"
        >
          Sign in
        </Link>
        <Link
          href={appHref("/signup")}
          className="ml-1 rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white"
        >
          Get started
        </Link>
      </div>
    );
  }

  const { user } = session;
  const username = user.displayUsername ?? user.username ?? user.name;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      setOpen(false);
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm text-zinc-300 transition hover:bg-white/5 hover:text-zinc-100";

  return (
    <div ref={containerRef} className="relative flex items-center gap-3">
      {showDashboardLink ? (
        <Link
          href={appHref("/")}
          className={`hidden sm:inline-flex ${headerPillClass}`}
        >
          Dashboard
        </Link>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 text-xs font-semibold uppercase text-teal-300 ring-white/20 transition hover:ring-2"
      >
        {username.charAt(0)}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-lg border border-white/10 bg-[#111113] p-1 shadow-xl shadow-black/40"
        >
          <Link
            href={appHref("/settings")}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 transition hover:bg-white/5"
          >
            <div className="text-sm font-semibold text-zinc-100">
              {username}
            </div>
            <div className="truncate text-xs text-zinc-500">{user.email}</div>
          </Link>

          <div className="my-1 border-t border-white/5" />

          <Link
            href={appHref("/")}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <LayoutGrid className="h-4 w-4 text-zinc-500" aria-hidden />
            Dashboard
          </Link>
          <Link
            href={appHref("/settings/organizations")}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Building2 className="h-4 w-4 text-zinc-500" aria-hidden />
            Your organizations
          </Link>
          <Link
            href={appHref("/settings")}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={itemClass}
          >
            <Settings className="h-4 w-4 text-zinc-500" aria-hidden />
            Settings
          </Link>
          <div className="my-1 border-t border-white/5" />

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className={`${itemClass} disabled:opacity-50`}
          >
            <LogOut className="h-4 w-4 text-zinc-500" aria-hidden />
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
