import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The blueprint dot grid behind schematic surfaces. */
export const DOTS: CSSProperties = {
  backgroundImage: "radial-gradient(var(--hairline) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
  backgroundPosition: "center",
};

/**
 * A hairline-framed region with corner registration marks, in the technical
 * "schematic" style. Lay children out in a divided grid inside it so content is
 * separated by thin rules instead of stacked into filled cards.
 */
export function Schematic({
  children,
  className,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  /**
   * Span the full width of the content column: draw only top and bottom rules
   * and let the column's own side rails close the frame.
   */
  bleed?: boolean;
}) {
  return (
    <div
      className={cn("relative border-hairline", bleed ? "border-y" : "border", className)}
      style={DOTS}
    >
      <CornerMarks />
      {children}
    </div>
  );
}

/** Four L-shaped ticks that sit on the frame's corners. */
function CornerMarks() {
  const arm = "pointer-events-none absolute z-20 h-2.5 w-2.5 border-mark";
  return (
    <>
      <span className={cn(arm, "-left-px -top-px border-l border-t")} />
      <span className={cn(arm, "-right-px -top-px border-r border-t")} />
      <span className={cn(arm, "-bottom-px -left-px border-b border-l")} />
      <span className={cn(arm, "-bottom-px -right-px border-b border-r")} />
    </>
  );
}

/** Column rules are drawn by .slant-rules in globals.css, leaning at the
 * site's tilt. */
const COLS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2 sm:divide-y-0 slant-rules-2",
  3: "sm:grid-cols-3 sm:divide-y-0 slant-rules-3",
  4: "lg:grid-cols-4 lg:divide-y-0 slant-rules-4",
};

/**
 * A grid that divides its cells with hairlines: stacked with horizontal rules on
 * mobile, columns with slanted rules from the breakpoint up. Drop it inside a
 * Schematic.
 */
export function SchematicGrid({
  children,
  cols = 3,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div className={cn("slant-rules grid divide-y divide-hairline *:min-w-0", COLS[cols], className)}>
      {children}
    </div>
  );
}
