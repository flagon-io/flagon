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
 * A crosshair marking one point where the grid's rules cross.
 *
 * Drafting convention, borrowed on purpose: registration marks sit at the
 * intersections on a technical drawing, and putting them where our horizontal
 * band rules meet the vertical column rules says the layout is measured rather
 * than merely decorated. Two 9px hairlines rather than a "+" glyph, so it
 * aligns to the pixel instead of to a font's baseline.
 */
export function CrossMark({ className }: { className: string }) {
  return (
    <span aria-hidden className={`absolute z-10 hidden lg:block ${className}`}>
      <span className="absolute left-1/2 top-1/2 h-px w-2.5 -translate-x-1/2 -translate-y-1/2 bg-white/25" />
      <span className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-white/25" />
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
    // to know about it. `w-screen` plus the negative half-width offset is what
    // keeps this working inside a max-w container.
    //
    // `w-screen` is 100vw, which INCLUDES the scrollbar, so this band
    // overhangs the content area by half a scrollbar on each side. That is
    // deliberate and handled globally: `html { overflow-x: clip }` in
    // globals.css trims the overhang. Without that rule the document scrolls
    // sideways and every centred element on the page drifts left.
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
            <CrossMark className="-left-px -top-px" />
            <CrossMark className="-right-px -top-px" />
            <CrossMark className="-bottom-px -left-px" />
            <CrossMark className="-bottom-px -right-px" />
          </>
        ) : null}
        {children}
      </div>
    </div>
  );
}
