import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { SCENES, type SceneName } from "@/components/art/scenes";
import { SlantBox } from "@/components/slant";
import { DOTS } from "@/components/schematic";
import { runForHeight, slantSurface } from "@/lib/slant";

export type ChipLink = { label: string; href: string; external?: boolean };

/**
 * A small uppercase tag, slanted like the buttons. With an href it's a friendly way into a deeper page
 * ("Values", "Pay formula"); without one it's just a tag.
 */
export function Chip({ label, href, external }: { label: string; href?: string; external?: boolean }) {
  const cls = cn(
    slantSurface,
    "inline-flex items-center px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/80 before:bg-foreground/[0.06]",
  );
  if (!href) return <span className={cls}>{label}</span>;
  const linkCls = cn(
    cls,
    "outline-none transition-colors hover:text-foreground hover:before:bg-brand/15 focus-visible:before:ring-2 focus-visible:before:ring-brand",
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
 * A card that leads with a drawing: the art on a panel leaning at the site's
 * tilt, then the title, a short paragraph, and chips into the details. The
 * words sit flush under the panel's bottom-left corner.
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
  const run = runForHeight("var(--stage-h)");
  return (
    <article className={cn("art-host flex flex-col", className)}>
      {/* A fixed-height stage, so wide and narrow cards keep the same rhythm
          and lean at the same angle; the drawing centers in it at its own
          aspect. */}
      <SlantBox
        run={run}
        className="h-(--stage-h) [--stage-h:13rem] sm:[--stage-h:15rem]"
        frameClassName="rounded-sm border border-hairline bg-(--art-card)"
      >
        <div
          className={cn("flex h-full items-center justify-center py-2", artClassName)}
          style={{ ...DOTS, paddingInline: run }}
        >
          <Scene id={artId ?? `card-${art}`} className="h-full w-full" />
        </div>
      </SlantBox>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <div className="mt-2">
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
