import type { ReactNode } from "react";
import { brand, FlagonMark, GridBackdrop } from "@flagon/design";
import { WEB_URL } from "@/lib/urls";

/**
 * The common frame for every auth screen (sign in, sign up, password reset): a
 * centered card under the Flagon mark, which links back to the marketing site.
 * Each page supplies its own heading, body, and footer so the three stay
 * visually identical and only differ where they should.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <GridBackdrop />
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <a
              href={WEB_URL}
              aria-label={`Back to ${brand.domain}`}
              className="rounded-md transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:outline-none"
            >
              <FlagonMark className="size-10" />
            </a>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-sm text-zinc-400">{subtitle}</p>
            ) : null}
          </div>

          <div className="mt-8 rounded-xl border border-white/10 bg-white/2 p-6">
            {children}
          </div>

          {footer ? (
            <p className="mt-6 text-center text-xs text-zinc-500">{footer}</p>
          ) : null}
        </div>
      </main>
    </>
  );
}
