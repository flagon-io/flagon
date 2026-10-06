/**
 * The site's one lean. Every slanted edge, from the product rail's cards to
 * the split panels and the column rules, leans by the same angle, so they read
 * as one system instead of a pile of unrelated tilts.
 *
 * TILT is the horizontal run per unit of height (about 8.5 degrees), steep
 * enough to read on something as short as a button. Keep it
 * in step with --tilt in globals.css, which is what the CSS reads.
 */
export const TILT = 0.15;

/**
 * How far a slanted box's top is shifted right, as a CSS length, for a box of
 * the given height (any CSS length).
 */
export function runForHeight(height: string): string {
  return `calc(var(--tilt) * ${height})`;
}

/**
 * How far a slanted box's top is shifted right, for a box with a fixed aspect
 * ratio (width / height). The run follows the height, so a fixed aspect makes
 * it a fixed share of the width. It's in cqw, not %, so it means the same
 * length on every element inside a SlantBox (which is the size container),
 * whatever that element's own width.
 */
export function runForAspect(aspect: number): string {
  return `calc(var(--tilt) / ${aspect} * 100cqw)`;
}

/** The fraction of a fixed-aspect box's width its top is shifted right. */
export function slantForAspect(aspect: number): number {
  return TILT / aspect;
}

/**
 * Gives an element a slanted surface: its fill, border and focus ring are
 * drawn on a pseudo-element skewed to the site's tilt, so the element itself
 * and its text stay upright. Style the surface with before: utilities
 * (before:bg-*, before:border, before:border-*). Used by buttons, chips and
 * badges, so the things you press and read as labels share the site's cut.
 */
export const slantSurface =
  "relative isolate before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[3px] before:slant-skew before:transition-colors";
