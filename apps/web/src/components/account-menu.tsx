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
 * The marketing site does not run BetterAuth, so sign-out is a credentialed POST
 * to the console's auth endpoint (a trusted origin), which clears the shared
 * `.flagon.io` session cookie; we then reload as a signed-out visitor.
 */
export function AccountMenu({ user }: { user: MarketingUser }) {
  async function signOut() {
    try {
      await fetch(`${APP_URL}/api/auth/sign-out`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the call fails, fall through to a reload: the header re-resolves
      // the session server-side, so the UI stays honest.
    }
    window.location.assign("/");
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
