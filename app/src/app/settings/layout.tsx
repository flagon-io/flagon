import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/flagon-api";
import { getSession } from "@/lib/session";
import { SettingsChrome } from "./settings-chrome";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  // "Back to app" targets the user's first org (or the resolver at /). This is
  // the one deliberate fallback: the link is a navigation nicety, and personal
  // settings (password, 2FA, sessions) live in the auth DB, so an API outage
  // shouldn't lock a user out of them. "/" is always a correct target. Pages
  // that actually depend on /me (account, organizations) call requireMe() and
  // surface a failure through settings/error.tsx.
  const me = await getMe().catch(() => null);
  const homeHref = me && me.orgs.length > 0 ? `/${me.orgs[0].slug}` : "/";

  const u = session.user as {
    email: string;
    name?: string | null;
    image?: string | null;
    username?: string | null;
    displayUsername?: string | null;
  };

  const user = { email: u.email, name: u.name ?? null, image: u.image ?? null };
  const account = {
    name: u.name ?? null,
    username: u.displayUsername || u.username || null,
    email: u.email,
    image: u.image ?? null,
  };

  return (
    <SettingsChrome user={user} account={account} homeHref={homeHref}>
      {children}
    </SettingsChrome>
  );
}
