import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

type PagerLink = { href: string; title: string };

/** Previous / next cards at the foot of a long-form page (handbook, books). */
export function Pager({ prev, next }: { prev: PagerLink | null; next: PagerLink | null }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group rounded-lg border border-hairline p-5 transition hover:bg-panel"
        >
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Previous
          </span>
          <p className="mt-2 font-medium tracking-tight group-hover:text-brand">{prev.title}</p>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group rounded-lg border border-hairline p-5 text-right transition hover:bg-panel"
        >
          <span className="flex items-center justify-end gap-1.5 font-mono text-[10px] uppercase tracking-widest text-subtle">
            Next <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
          <p className="mt-2 font-medium tracking-tight group-hover:text-brand">{next.title}</p>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
