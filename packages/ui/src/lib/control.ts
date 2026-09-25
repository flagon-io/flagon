/**
 * The shared size scale for interactive controls (buttons, inputs, selects,
 * input groups). One source of truth for control HEIGHT, so a button and the
 * input beside it are always the same height and can never drift apart.
 *
 * Only height lives here, because that is what must match across control types
 * for a row to align. Horizontal padding and text size stay per-component (a
 * button pads more than a text field), each pairing its own padding to these
 * heights.
 */
export type ControlSize = "sm" | "md" | "lg";

/**
 * Control height per size. The values come from the `--control-sm/md/lg` CSS
 * tokens (defaults 32/40/44px) so a Brand can set the whole system's density in
 * one place, rather than every control hardcoding a height.
 */
export const controlHeight: Record<ControlSize, string> = {
  sm: "h-[var(--control-sm)]",
  md: "h-[var(--control-md)]",
  lg: "h-[var(--control-lg)]",
};

/**
 * The ONE focus-visible treatment for every interactive element in the system: a
 * 2px `--ring` outline, offset 2px from the element.
 *
 * It is an OUTLINE, never a box-shadow ring, on purpose: box-shadow is reserved
 * for the Brand's chunky button elevation (see Button), and a shadow-based ring
 * would fight it (one would overwrite the other). An outline also survives
 * `overflow` and forced-colors mode better. Apply it to the focusable element
 * itself; `outline-none` removes the browser default so only ours shows.
 */
export const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * The same outline drawn INSIDE the element's edge, for items packed edge to
 * edge or inside a clipping (overflow) container - menu buttons in a scrolling
 * sidebar, segments of a toggle group, accordion triggers - where an outer offset
 * would be clipped or overlap a neighbor.
 */
export const focusRingInset =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * The focus treatment for a composite field whose real focus target is an inner
 * element (an input group, a color field): the wrapper shows the ring while any
 * descendant has focus.
 */
export const focusWithinRing =
  "focus-within:outline-2 focus-within:outline-solid focus-within:outline-offset-2 focus-within:outline-ring";
