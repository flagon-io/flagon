import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getMe } from "@/lib/flagon-api";
import { SettingsChrome } from "./settings-chrome";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // "Back to app" targets the user's first org (or the resolver at /).
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
