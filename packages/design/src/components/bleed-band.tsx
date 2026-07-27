/**
 * A section whose horizontal rules run the full width of the viewport while
 * its content stays inside the page's max-width.
 *
 * The rules are the point. A card grid boxed inside a centred column reads as
 * a widget dropped onto a page; the same grid with its band ruled edge to edge
 * reads as a STRUCTURAL division of the page, and the eye follows the line out
 * past the content instead of stopping at a corner. It is the difference
 * between a page with things on it and a page that is built out of parts.
 *
 * The content keeps its own left and right borders, so the block still closes
 * on all four sides at the max-width; only the horizontals escape.
 */

/**
 * A small square node marking one point where the grid's rules cross.
 *
 * Drafting convention, borrowed on purpose: a junction on a schematic is drawn
 * as a node, not a crossing. A filled square (background-coloured, so the
 * rules appear to stop at its edges and pass cleanly through the corner) reads
 * as that node, and its hairline outline catches just enough light to
 * register. Sized to the pixel and background-filled rather than a "+" glyph,
 * so it lands exactly on the intersection instead of to a font's baseline.
 */
export function CornerMark({ className }: { className: string }) {
  return (
    <span aria-hidden className={`absolute z-10 hidden lg:block ${className}`}>
      <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 border border-white/30 bg-background" />
    </span>
  );
}

export function BleedBand({
  children,
  className = "",
  outerClassName = "",
  bordered = true,
  marks = true,
}: {
  children: React.ReactNode;
  /** Extra classes for the inner, width-constrained container. */
  className?: string;
  /** Extra classes for the full-bleed band itself (margins live here). */
  outerClassName?: string;
  /** Whether the inner block carries its own left/right rules. */
  bordered?: boolean;
  /** Crosshairs where this band's rules meet the page grid's verticals. */
  marks?: boolean;
}) {
  return (
    // Full-bleed: breaks out of any centred parent without needing the parent
    // to know about it. `w-screen` plus the negative half-width offset keeps
    // this working inside a max-w container. The scrollbar overhang it creates
    // is trimmed globally by `html { overflow-x: clip }` in the design styles.
    <div
      className={`relative left-1/2 w-screen -translate-x-1/2 border-y border-white/10 ${outerClassName}`}
    >
      <div
        className={`relative mx-auto w-full max-w-7xl ${bordered ? "border-white/10 sm:border-x" : ""} ${className}`}
      >
        {/* One at each corner, which is exactly where the band's horizontal
            rules cross the content column's verticals. */}
        {marks ? (
          <>
            <CornerMark className="-left-px -top-px" />
            <CornerMark className="-right-px -top-px" />
            <CornerMark className="-bottom-px -left-px" />
            <CornerMark className="-bottom-px -right-px" />
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}
