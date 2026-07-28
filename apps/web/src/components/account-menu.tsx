"use client";

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@flagon/design";
import { APP_URL } from "@/lib/urls";

type MarketingUser = { name: string; email: string; username: string | null };

/**
 * The account menu for the marketing header, mirroring the console's: an avatar
 * button (the user's initial) with a dropdown to account settings and sign out.
 *
 * The marketing site does not run BetterAuth, and a cross-origin POST to its
 * sign-out needs CORS the console doesn't grant on its auth routes. So we sign
 * out the way cross-domain logout is meant to work: a top-level navigation to
 * the console's own /sign-out (same-origin there, no CORS), which clears the
 * shared session cookie and redirects us back here as a signed-out visitor.
 */
export function AccountMenu({ user }: { user: MarketingUser }) {
  function signOut() {
    const returnTo = encodeURIComponent(window.location.href);
    window.location.assign(`${APP_URL}/sign-out?returnTo=${returnTo}`);
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-xs font-semibold text-zinc-200 transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-teal-500/50"
        >
          {(user.name || user.email).charAt(0).toUpperCase()}
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium text-zinc-100">
            {user.name}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {user.username ? `@${user.username}` : user.email}
          </p>
        </div>
        <MenuSeparator />
        <MenuItem asChild>
          <a href={`${APP_URL}/settings`}>Account settings</a>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={signOut}>Sign out</MenuItem>
      </MenuContent>
    </Menu>
  );
}
