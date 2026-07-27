import type { ReactNode } from "react";
import Link from "next/link";
import { brand, FlagonMark } from "@flagon/design";
import { AccountMenu } from "@/components/workspace/account-menu";

type UserInfo = { name: string; email: string; username: string | null };

/**
 * The frame for the signed-in onboarding steps (create an organization, choose
 * an organization). It wears the same chrome as the rest of the app: a full-width
 * black top bar with the account menu on the right, just without a sidebar (there
 * is no org context yet). Content sits centered below.
 */
export function OnboardingShell({
  user,
  title,
  subtitle,
  size = "md",
  children,
}: {
  user: UserInfo;
  title: string;
  subtitle?: ReactNode;
  /** Content width. "lg" suits multi-column layouts like the plan picker. */
  size?: "md" | "lg";
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-black">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/8 bg-black px-4">
        <Link
          href="/"
          aria-label={brand.name}
          className="rounded-md transition-opacity hover:opacity-80"
        >
          <FlagonMark className="h-7 w-7" />
        </Link>
        <AccountMenu user={user} />
      </header>

      <main className="flex flex-1 flex-col items-center px-6 py-12 sm:py-16">
        <div className={`w-full ${size === "lg" ? "max-w-5xl" : "max-w-2xl"}`}>
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm text-zinc-400">{subtitle}</p>
            ) : null}
          </div>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
