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
