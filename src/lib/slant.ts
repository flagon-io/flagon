/**
 * The site's one lean. Every slanted edge, from the product rail's cards to
 * the split panels and the column rules, leans by the same angle, so they read
 * as one system instead of a pile of unrelated tilts.
 *
 * TILT is the horizontal run per unit of height (about 6.5 degrees). Keep it
 * in step with --tilt in globals.css, which is what the CSS reads.
 */
export const TILT = 4 / 35;

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
