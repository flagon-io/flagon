"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, UserCog } from "lucide-react";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@flagon-io/ui";
import { authClient } from "@/lib/auth-client";
import type { ShellUser } from "./types";

export function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const initials = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none ring-offset-2 ring-offset-background transition focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:ring-2 data-[state=open]:ring-brand"
        aria-label="Account menu"
      >
        <Avatar className="size-8">
          {user.image && <AvatarImage src={user.image} alt="" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-foreground">{user.name || user.email}</p>
          {user.name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <UserCog />
            <span>Account settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
