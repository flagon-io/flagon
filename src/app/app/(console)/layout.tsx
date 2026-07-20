import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { brand } from "@/lib/brand";
import { FlagonMark } from "@/lib/logo";
import { UserMenu } from "@/components/user-menu";
import { listEmails } from "@/lib/user-emails";
import { VerifyEmailBanner } from "./verify-email-banner";

/**
 * Signed-in console chrome. The session check gates every console page: an
 * anonymous visit to any org/console URL lands on the sign-in form instead.
 * Auth pages live in the sibling (auth) group so they stay reachable.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/app/signin");

  // Unverified primary email: keep the user signed in (no lockouts) but nag
  // persistently until the address is proven.
  const primaryEmail = session.user.emailVerified
    ? null
    : ((await listEmails(session.user.id)).find((e) => e.isPrimary) ?? null);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#09090b]/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <Link href="/app" className="flex items-center gap-2">
              <FlagonMark className="h-6 w-6" />
              <span className="text-sm font-semibold tracking-tight">
                {brand.name}
              </span>
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-sm text-zinc-400">Console</span>
          </div>
          <UserMenu />
        </div>
      </header>

      {primaryEmail ? (
        <VerifyEmailBanner
          email={primaryEmail.email}
          emailRowId={primaryEmail.id}
        />
      ) : null}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10">
        {children}
      </main>
    </>
  );
}
