import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** A responsive grid of cards for hub/overview pages. */
export function CardGrid({
  children,
  cols = 2,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
}) {
  const col = cols === 3 ? "sm:grid-cols-3" : cols === 1 ? "" : "sm:grid-cols-2";
  return <div className={`my-6 grid gap-4 ${col}`}>{children}</div>;
}

/**
 * A linked card: an eyebrow, a title, a line of description. Used to lay out the
 * home hub and product overviews the way GitHub/Vercel docs do.
 */
export function Card({
  href,
  title,
  eyebrow,
  children,
  cta,
  badge,
}: {
  href?: string;
  title: string;
  eyebrow?: string;
  children?: ReactNode;
  cta?: string;
  badge?: ReactNode;
}) {
  const interactive = Boolean(href);
  const inner = (
    <>
      {eyebrow ? (
        <div className="mb-1 text-xs font-semibold tracking-wide text-teal-400/80 uppercase">
          {eyebrow}
        </div>
      ) : null}
      <div
        className={
          "flex items-center gap-1.5 text-base font-semibold " +
          (interactive ? "text-zinc-100 group-hover:text-teal-300" : "text-zinc-400")
        }
      >
        {title}
        {badge}
        {interactive ? (
          <ArrowRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        ) : null}
      </div>
      {children ? (
        // A div, not a p: in MDX the description is itself wrapped in a <p>, and
        // <p> can't nest. Neutralize that inner paragraph's margin/size so the
        // card reads the same whether the child is raw text or an MDX paragraph.
        <div className="mt-1.5 text-sm/6 text-zinc-500 [&>p]:my-0 [&>p]:text-sm/6 [&>p]:text-inherit">
          {children}
        </div>
      ) : null}
      {cta ? (
        <div className="mt-3 text-sm font-medium text-teal-400">{cta} &rarr;</div>
      ) : null}
    </>
  );

  const base =
    "block rounded-xl border p-5 transition " +
    (interactive
      ? "group border-white/10 bg-white/[0.02] hover:border-teal-400/30 hover:bg-white/[0.04]"
      : "border-white/5 bg-white/[0.01]");

  if (!href) return <div className={base}>{inner}</div>;
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={base}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={base}>
      {inner}
    </Link>
  );
}

/** A pill badge, e.g. "Available" / "Coming soon" on product cards. */
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "available" | "soon" | "muted";
}) {
  const tones = {
    available: "border-teal-400/30 bg-teal-400/10 text-teal-300",
    soon: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    muted: "border-white/15 bg-white/5 text-zinc-400",
  };
  return (
    <span
      className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 align-middle text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
