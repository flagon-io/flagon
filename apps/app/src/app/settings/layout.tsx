import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FlagonMark } from "@flagon/design";
import { getSession } from "@/lib/auth";
import { SettingsNav } from "@/components/settings/settings-nav";
import { AccountMenu } from "@/components/workspace/account-menu";

const ITEMS = [
  { href: "/settings", label: "Profile" },
  { href: "/settings/emails", label: "Emails" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/tokens", label: "Access tokens" },
];

/**
 * Personal (account) settings frame. Unlike organization settings, this lives
 * outside any /<org> workspace, so it carries its own slim header with a way
 * back to the app. Left nav + content, GitHub-style.
 */
export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-white/8 px-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="Back to workspace" className="hover:opacity-80">
            <FlagonMark className="h-7 w-7" />
          </Link>
          <span className="text-white/15">/</span>
          <span className="text-sm font-medium text-zinc-200">Settings</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-zinc-500 hover:text-zinc-300">
            Back to app
          </Link>
          <AccountMenu
            user={{
              name: session.user.name,
              email: session.user.email,
              username: session.user.username ?? null,
            }}
          />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-6 py-8 sm:flex-row">
        <aside className="sm:w-52 sm:shrink-0">
          <SettingsNav items={ITEMS} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
