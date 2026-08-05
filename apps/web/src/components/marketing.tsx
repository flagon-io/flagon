import type { ReactNode } from "react";

/**
 * Small shared atoms for the marketing pages (Products, Pricing) so their
 * section rhythm and status pills stay identical instead of drifting page to
 * page. Anything richer stays local to the page that needs it.
 */

/** A status/category pill: Available, Coming soon, the core, or neutral. */
export function Badge({
  tone = "muted",
  children,
}: {
  tone?: "available" | "soon" | "core" | "muted";
  children: ReactNode;
}) {
  const tones = {
    available: "border-teal-400/30 bg-teal-400/10 text-teal-300",
    soon: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    core: "border-violet-400/30 bg-violet-400/10 text-violet-300",
    muted: "border-white/15 bg-white/5 text-zinc-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The base status badge: a rounded pill with a live (pulsing) dot and uppercase,
 * letter-spaced mono text. This is the OpenMouse-style "early access" chip, used in
 * the hero and the early-access band so the signal reads identically everywhere.
 * Keep the label short (it is uppercased and tracked, so long text gets unwieldy).
 */
export function StatusBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-zinc-900 uppercase ring-1 ring-black/5 ring-inset">
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-500 opacity-70" />
        <span className="relative inline-flex size-1.5 rounded-full bg-teal-500" />
      </span>
      {children}
    </span>
  );
}

/** A left-aligned section header: mono eyebrow, headline, and a lede. */
export function SectionHead({
  eyebrow,
  title,
  lede,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`max-w-2xl ${className}`}>
      {eyebrow ? (
        <p className="font-mono text-xs tracking-[0.2em] text-teal-400/80 uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
        {title}
      </h2>
      {lede ? <p className="mt-3 text-base/7 text-zinc-400">{lede}</p> : null}
    </div>
  );
}
