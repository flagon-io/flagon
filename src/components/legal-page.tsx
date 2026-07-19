import type { ReactNode } from "react";

/**
 * Shared shell for legal/policy pages (Terms, Privacy, etc.).
 * Content is placeholder until finalized copy is provided.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
        Legal
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-100">
        {title}
      </h1>
      <p className="mt-3 text-sm text-zinc-500">Last updated {updated}</p>

      <div className="mt-6 rounded-lg border border-white/10 bg-white/3 px-4 py-3 text-sm text-zinc-400">
        This is a placeholder document and does not yet constitute a binding
        agreement. Final terms will be published before general availability.
      </div>

      <div className="mt-10 space-y-6 text-[15px] leading-7 text-zinc-400">
        {children}
      </div>
    </main>
  );
}
