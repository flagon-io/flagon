"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarImage, AvatarFallback, cn } from "@flagon-io/ui";
import { Logo } from "@/components/logo";
import { Topbar } from "@/components/shell/topbar";
import { initials } from "@/lib/initials";
import type { ShellUser } from "@/components/shell/types";
import { settingsNav, settingsActive } from "./settings-nav";

export type SettingsAccount = {
  name: string | null;
  username: string | null;
  email: string;
  image: string | null;
};

export function SettingsChrome({
  user,
  account,
  homeHref,
  children,
}: {
  user: ShellUser;
  account: SettingsAccount;
  homeHref: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col bg-background">
      <Topbar
        user={user}
        left={
          <Link
            href={homeHref}
            className="flex items-center gap-2 font-semibold text-foreground outline-none focus-visible:text-brand-bright"
          >
            <Logo className="size-5" />
            <span>Flagon</span>
          </Link>
        }
      />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8 md:flex-row md:gap-10">
          <aside className="md:w-64 md:shrink-0 md:self-start">
            {/* Account header. */}
            <div className="flex items-center gap-3">
              <Avatar className="size-11">
                {account.image && <AvatarImage src={account.image} alt="" />}
                <AvatarFallback>{initials(account)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {account.name || account.username || "Your account"}
                  {account.username && (
                    <span className="font-normal text-muted-foreground"> ({account.username})</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">Your personal account</p>
              </div>
            </div>

            <nav className="mt-5" aria-label="Account settings">
              {settingsNav.map((group, gi) => (
                <div key={gi} className={cn(group.label && "mt-4 border-t border-hairline pt-4")}>
                  {group.label && (
                    <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">
                      {group.label}
                    </p>
                  )}
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const active = settingsActive(pathname, item.href, item.exact);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex h-8 items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand",
                              active
                                ? "bg-accent font-semibold text-foreground"
                                : "text-foreground/80 hover:bg-accent/60 hover:text-foreground",
                            )}
                          >
                            <Icon
                              className={cn(
                                "size-4 shrink-0",
                                active ? "text-foreground" : "text-muted-foreground",
                              )}
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 flex-1 md:max-w-3xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
