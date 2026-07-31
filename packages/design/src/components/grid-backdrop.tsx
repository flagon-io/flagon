/**
 * The page grid: two full-height vertical rules marking the content column,
 * with fainter guides in the margins beyond it.
 *
 * Horizontal rules alone (see BleedBand) divide a page into bands. Adding the
 * verticals makes it read as a GRID the layout was drawn on: the same
 * technical-drawing language as a schematic or a spec sheet, which is the
 * right register for a developer platform and costs nothing but two hairlines.
 *
 * Deliberately behind everything and non-interactive. The column rules sit
 * exactly where a BleedBand's own left and right borders land, so where a band
 * exists they reinforce it and where one does not they carry the line through
 * the gap. That continuity is the whole effect: the grid never stops, the
 * content just starts and stops sitting on it.
 *
 * Hidden below `lg`, where there is no margin to draw in and the rules would
 * crowd the text instead of framing it.
 */
export function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="inset-0 lg:flex pointer-events-none fixed z-0 hidden justify-center"
    >
      <div className="max-w-7xl relative size-full">
        {/* The content column's own edges, carried the full height. */}
        <span className="inset-y-0 left-0 bg-white/6 absolute w-px" />
        <span className="inset-y-0 right-0 bg-white/6 absolute w-px" />
        {/* Margin guides: fainter, and outside the column, so they read as the
            grid continuing rather than as another container. */}
        <span className="inset-y-0 -left-24 bg-white/3 absolute w-px" />
        <span className="inset-y-0 -right-24 bg-white/3 absolute w-px" />
      </div>
    </div>
  );
}
