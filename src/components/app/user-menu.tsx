'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, UserRound } from 'lucide-react';
import { signOut } from '@/lib/auth-client';
import { cn } from '@/lib/cn';

export type SessionUser = {
  name?: string | null;
  email: string;
  username?: string | null;
  image?: string | null;
};

/**
 * Account menu pinned to the top-right of the app/marketing header.
 * Avatar button → popover with identity, a couple of account links, and sign out.
 * `homeHref` is the dashboard target; `signOutRedirect` is where we land after
 * clearing the session (absolute, so it works across subdomains).
 */
export function UserMenu({
  user,
  homeHref,
  signOutRedirect,
  accountHref,
}: {
  user: SessionUser;
  homeHref: string;
  signOutRedirect: string;
  /** Link to account settings; omit to hide the item. */
  accountHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = user.name || user.username || user.email;
  const initial = label.slice(0, 1).toUpperCase();
  const subtitle = user.username ? `@${user.username}` : user.email;

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    window.location.assign(signOutRedirect);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-500 text-sm font-bold text-black outline-none ring-offset-2 ring-offset-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {user.image ? <img src={user.image} alt="" className="size-full object-cover" /> : initial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{label}</p>
            <p className="truncate text-xs text-muted">{subtitle}</p>
          </div>
          <div className="my-1 h-px bg-border" />
          <a
            href={homeHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-card-muted"
          >
            <UserRound className="size-4 text-muted" /> Dashboard
          </a>
          {accountHref && (
            <a
              href={accountHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-card-muted"
            >
              <Settings className="size-4 text-muted" /> Account settings
            </a>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            onClick={handleSignOut}
            disabled={busy}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground transition-colors hover:bg-card-muted',
              busy && 'opacity-60',
            )}
          >
            <LogOut className="size-4 text-muted" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
