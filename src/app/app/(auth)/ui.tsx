"use client";

import { usePathname } from "next/navigation";

/**
 * Auth-flow specific helpers on top of the shared form primitives.
 *
 * useAuthBase: auth pages are served at /app/signin locally but /signin on the
 * app subdomain in production (the proxy rewrite hides the /app segment from
 * the browser). Deriving sibling links and the post-auth destination from the
 * CURRENT pathname keeps both environments correct without configuration.
 */
export {
  inputClass,
  labelClass,
  linkClass,
  Notice,
} from "@/components/form-ui";

export function useAuthBase(): string {
  const pathname = usePathname();
  return pathname.replace(/\/[^/]*\/?$/, "");
}

/** Full-width variant for the single-action auth cards. */
export const primaryButtonClass =
  "mt-4 block w-full rounded-md bg-teal-500 px-3 py-2 text-center text-sm font-semibold text-zinc-950 transition hover:bg-teal-400 disabled:cursor-default disabled:opacity-60";

export function AuthTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-4 text-center text-xl font-semibold tracking-tight text-zinc-100">
      {children}
    </h1>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/2 p-4">
      {children}
    </div>
  );
}

/** Secondary card below the form, e.g. "New to Flagon? Create an account." */
export function AuthAltCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-white/10 p-4 text-center text-sm text-zinc-400">
      {children}
    </div>
  );
}
