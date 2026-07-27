import type { ReactNode } from "react";
import { GridBackdrop } from "@flagon/design";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

/**
 * The frame for policy pages (Terms, Privacy, Security): the standard site
 * chrome around a single readable column. Child pages write plain semantic HTML
 * (h2 / p / ul); the wrapper here styles it, so every policy page reads the same.
 */
export function LegalShell({
  title,
  updated,
  intro,
  draft = false,
  children,
}: {
  title: string;
  updated: string;
  intro?: ReactNode;
  /** Show a prominent notice that this document is a working draft, not final. */
  draft?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <GridBackdrop />
      <SiteHeader />
      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-500">Last updated {updated}</p>
        {draft ? (
          <div className="mt-6 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm leading-6 text-amber-200">
            <strong className="font-semibold">Draft.</strong> This is a working
            draft, not the final version. It is shared for transparency during
            the alpha and may change before launch.
          </div>
        ) : null}
        {intro ? (
          <p className="mt-6 text-base leading-7 text-zinc-300">{intro}</p>
        ) : null}
        <div className="mt-8 space-y-4 text-sm leading-7 text-zinc-400 [&_a:hover]:text-teal-300 [&_a]:text-teal-400 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_strong]:text-zinc-200 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
