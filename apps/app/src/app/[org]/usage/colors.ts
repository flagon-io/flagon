/**
 * The categorical series palette for the usage views (chart, legend, sparklines).
 *
 * Fixed order, assigned by index and never cycled — the CVD-safe dark-surface
 * steps from the design-system data-viz palette. Identity follows the entity
 * (series key), not its rank, so a filter that changes the series count must not
 * repaint the survivors: assign from a stable key order. Past eight series the
 * chart folds the tail into "Other" (a recessive gray) rather than inventing hues.
 */
export const SERIES_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
] as const;

export const OTHER_COLOR = "#6b7280"; // gray — the folded "Other" bucket
export const OTHER_KEY = "__other__";

/** How many distinct hues the chart shows before folding the rest into "Other". */
export const MAX_SERIES = SERIES_COLORS.length;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length]!;
}
