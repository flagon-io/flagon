import { appPath } from "@/lib/urls";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SettingsNav } from "./settings-nav";

export const metadata: Metadata = {
  title: "Settings",
};

/**
 * Settings shell: identity header, sidebar nav, content pane.
 * Sections that don't exist yet render as disabled placeholders in the nav.
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(appPath("/signin"));

  const { user } = session;
  const displayName = user.displayUsername ?? user.username ?? user.name;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex items-center gap-3 pb-8">
        <div
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/20 text-lg font-semibold uppercase text-teal-300"
        >
          {displayName.charAt(0)}
        </div>
        <div>
          <div className="text-base font-semibold text-zinc-100">
            {user.name}{" "}
            <span className="font-normal text-zinc-500">({displayName})</span>
          </div>
          <div className="text-sm text-zinc-500">Your personal account</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_1fr]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
