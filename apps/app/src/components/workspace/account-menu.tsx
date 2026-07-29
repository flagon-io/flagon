"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  brand,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from "@flagon/design";
import { authClient } from "@/lib/auth-client";
import { WEB_URL } from "@/lib/urls";

type UserInfo = { name: string; email: string; username: string | null };

/**
 * The account menu (top-right of the workspace header): the user's avatar with a
 * Radix dropdown to personal settings, the marketing site, and sign out.
 */
export function AccountMenu({ user }: { user: UserInfo }) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
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
          <Link href="/settings">Your settings</Link>
        </MenuItem>
        <MenuItem asChild>
          <a href={`${WEB_URL}/docs`} target="_blank" rel="noreferrer">
            Documentation ↗
          </a>
        </MenuItem>
        <MenuItem asChild>
          <a href={WEB_URL}>{brand.domain} ↗</a>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={signOut}>Sign out</MenuItem>
      </MenuContent>
    </Menu>
  );
}
