import type { ReactNode } from "react";

/**
 * Shared shell for legal/policy pages (Terms, Privacy).
 *
 * These documents are BINDING. The service takes payments, so the previous
 * banner - "a placeholder document and does not yet constitute a binding
 * agreement" - described an agreement nobody was actually operating under
 * while cards were being charged. They are written in plain language against
 * what the platform really does, and they are not a substitute for review by
 * a lawyer.
 */
export function LegalPage({
  title,
  updated,
  summary,
  children,
}: {
  title: string;
  updated: string;
  /** One line above the fold: what this document is, in the reader's terms. */
  summary?: ReactNode;
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

      {summary ? (
        <div className="mt-6 border-l-2 border-teal-500/40 bg-white/2 px-4 py-3 text-sm leading-6 text-zinc-400">
          {summary}
        </div>
      ) : null}

      <div className="mt-10 space-y-8 text-[15px] leading-7 text-zinc-400">
        {children}
      </div>
    </main>
  );
}

/**
 * One numbered clause. Numbered because legal documents get REFERRED to: a
 * support reply or a procurement review needs to be able to say "section 7"
 * and have both sides land in the same place, so each one is also linkable.
 */
export function LegalSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={`section-${n}`} className="scroll-mt-24 space-y-3">
      <h2 className="text-lg font-semibold text-zinc-200">
        <span className="text-zinc-600">{n}.</span> {title}
      </h2>
      <div className="space-y-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}
