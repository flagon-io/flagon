import { appPath, marketingHref } from "@/lib/urls";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requireSession } from "@/lib/auth-guards.server";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { headerPillClass } from "@/components/form-ui";
import { UserMenu } from "@/components/user-menu";

/**
 * Signed-in chrome for flows that belong to no organization: creating one,
 * and accepting an invitation to one.
 *
 * Deliberately NOT the console layout. Rendering "create an organization"
 * inside another organization's sidebar tells the user the new one will live
 * under the old one, and puts a nav full of the wrong org's projects and
 * members next to a form about something else entirely. Accepting an
 * invitation has the same problem: the org you are being invited to is not the
 * org in the switcher.
 *
 * So: same top bar, same account menu, no org context at all. The logo goes
 * to the app root rather than to any particular organization.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#09090b]">
      {/* Matches the console's h-14 header band, so moving between the two
          does not shift the page under the cursor. */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/5 px-4 sm:px-6">
        <Link
          href={appPath("/")}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-100 transition hover:text-white"
        >
          <FlagonMark className="h-5 w-5 text-teal-400" />
          {brand.name}
        </Link>
        <div className="flex items-center gap-3">
          <Link href={marketingHref("/")} className={headerPillClass}>
            Return to site <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
