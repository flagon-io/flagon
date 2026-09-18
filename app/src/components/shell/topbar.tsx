"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Notifications } from "./notifications";
import { UserMenu } from "./user-menu";
import type { ShellUser } from "./types";

/**
 * The global top bar. Its right cluster (Ask AI, notifications, theme, user) is
 * consistent everywhere it appears - the org shell and personal settings. The
 * `left` slot carries page context; `actions` adds controls like Ask AI.
 */
export function Topbar({
  left,
  center,
  user,
  actions,
}: {
  left?: ReactNode;
  /** Centered page context (e.g. the breadcrumb). */
  center?: ReactNode;
  user: ShellUser;
  /** Extra controls at the start of the right cluster (e.g. Ask AI). */
  actions?: ReactNode;
}) {
  return (
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-hairline bg-background px-4">
      <div className="flex min-w-0 items-center">{left}</div>

      <div className="flex min-w-0 items-center justify-center">{center}</div>

      <div className="flex items-center justify-end gap-1.5">
        {actions}
        <Notifications />
        <ThemeToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
