import type { Metadata } from "next";
import { requireSession } from "@/lib/auth-guards.server";
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
  const session = await requireSession();

  const { user } = session;
  const displayName = user.displayUsername ?? user.username ?? user.name;

  return (
    // No max-width of its own. The surrounding <main> is already max-w-7xl, and
    // capping again here made every settings page sit narrower than the rest of
    // the product for no reason a reader could see. The measure that actually
    // matters - how wide a line of text or a form gets - is set on the content
    // column below, once, instead of by each page picking its own.
    <div className="w-full">
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

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[220px_minmax(0,1fr)]">
        <SettingsNav />
        {/* One readable measure for every settings page. Forms and prose stop
            at 3xl while the shell still spans the page, so the nav stays put
            and nothing stretches into an unreadable line. */}
        <div className="min-w-0 max-w-3xl">{children}</div>
      </div>
    </div>
  );
}
