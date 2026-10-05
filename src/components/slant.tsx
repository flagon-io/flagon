import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { SCENES, type SceneName } from "@/components/art/scenes";
import { DOTS } from "@/components/schematic";
import { Plus } from "@/components/plus";

/**
 * Slanted shapes at the site's one lean (lib/slant.ts). They skew rather than
 * clip, so the angle holds whatever an element's size, and borders follow the
 * slant for free.
 */

/**
 * A box whose sides lean at the site's tilt, with its content upright inside.
 * The bottom-left corner sits on the box's left edge and the top-right corner
 * on its right edge, so the shape never spills past its slot. `run` is how far
 * the top is shifted right (runForHeight / runForAspect in lib/slant.ts), and
 * the box needs a height of its own, from a class or an aspect ratio.
 *
 * `frameClassName` styles the slanted shape itself (border, background,
 * rounding); `className` the upright slot it sits in.
 */
export function SlantBox({
  run,
  children,
  className,
  frameClassName,
  style,
}: {
  run: string;
  children?: ReactNode;
  className?: string;
  frameClassName?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={cn("@container relative", className)} style={style}>
      <div
        className={cn("slant-skew absolute inset-y-0 left-0 origin-bottom-left overflow-hidden", frameClassName)}
        style={{ right: run }}
      >
        {/* Skewed back upright about the same corner, and widened by the run,
            so the content is a plain rectangle the size of the slot, clipped
            to the slanted shape. */}
        <div
          className="slant-unskew absolute inset-y-0 left-0 origin-bottom-left"
          style={{ right: `calc(-1 * ${run})` }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * A full-width section split on the slant: words on the left, a drawing on a
 * panel whose leading edge leans at the site's tilt, with crosshairs where
 * that edge meets the rules above and below. Stacks flat on phones.
 */
export function SlantSplit({
  children,
  art,
  artId,
  backdrop,
  divider = true,
  className,
}: {
  children: ReactNode;
  art: SceneName;
  /** Unique on the page, for the drawing's patterns. */
  artId: string;
  /** Sits behind the words, e.g. the hero's HexField. */
  backdrop?: ReactNode;
  /** A hairline above, as with Section's divider. */
  divider?: boolean;
  className?: string;
}) {
  const Scene = SCENES[art];
  const mark = "slant-unskew absolute hidden h-3.5 w-3.5 text-mark md:block";
  return (
    <section
      className={cn(
        "relative isolate grid overflow-x-clip md:grid-cols-2",
        divider && "border-t border-hairline",
        className,
      )}
    >
      {backdrop}
      <div className="relative flex flex-col justify-center px-6 py-14 sm:px-8 sm:py-20">
        {children}
      </div>
      <div className={cn("relative min-h-72", art === "g1t" && "art-g1t")}>
        <div
          aria-hidden
          className="absolute inset-0 border-t border-hairline bg-(--art-card) md:origin-bottom-left md:border-l md:border-t-0 md:slant-skew"
          style={DOTS}
        >
          <Plus className={cn(mark, "-left-[7px] -top-[7px]", !divider && "md:hidden")} />
          <Plus className={cn(mark, "-bottom-[7px] -left-[7px]")} />
        </div>
        <div className="relative flex h-full items-center justify-center px-8 py-10 md:pl-16">
          <Scene id={artId} className="w-full max-w-sm" />
        </div>
      </div>
    </section>
  );
}
