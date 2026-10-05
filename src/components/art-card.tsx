import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { SCENES, type SceneName } from "@/components/art/scenes";

export type ChipLink = { label: string; href: string; external?: boolean };

/**
 * A small uppercase pill. With an href it's a friendly way into a deeper page
 * ("Values", "Pay formula"); without one it's just a tag.
 */
export function Chip({ label, href, external }: { label: string; href?: string; external?: boolean }) {
  const cls =
    "inline-flex items-center rounded-full bg-foreground/[0.06] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/80";
  if (!href) return <span className={cls}>{label}</span>;
  const linkCls = cn(
    cls,
    "outline-none transition hover:bg-brand/15 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand",
  );
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={linkCls}>
      {label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <Link href={href} className={linkCls}>
      {label}
    </Link>
  );
}

/**
 * A card that leads with a drawing: the title over the art, a short paragraph,
 * then chips into the details. The art bleeds to the card's edges and fades
 * its construction lines out before them.
 */
export function ArtCard({
  title,
  art,
  artId,
  children,
  chips,
  className,
  artClassName,
}: {
  title: ReactNode;
  art: SceneName;
  /** Unique id for the drawing's patterns; defaults to the scene name. */
  artId?: string;
  children: ReactNode;
  chips?: ChipLink[];
  className?: string;
  artClassName?: string;
}) {
  const Scene = SCENES[art];
  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-(--art-card)",
        className,
      )}
    >
      <h3 className="relative z-10 px-6 pt-6 text-lg font-semibold tracking-tight sm:px-7">
        {title}
      </h3>
      {/* A fixed-height stage, so wide and narrow cards keep the same rhythm;
          the drawing centers in it at its own aspect. */}
      <div className={cn("-mt-4 h-52 px-2 sm:h-60", artClassName)}>
        <Scene id={artId ?? `card-${art}`} className="h-full w-full" />
      </div>
      <div className="mt-auto px-6 pb-6 sm:px-7 sm:pb-7">
        <div className="text-pretty text-sm leading-relaxed text-muted-foreground">{children}</div>
        {chips && chips.length > 0 ? (
          <ul className="mt-5 flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c.label}>
                <Chip {...c} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}
