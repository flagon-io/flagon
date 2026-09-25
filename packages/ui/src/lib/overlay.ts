/**
 * The one modal backdrop. Every overlay (Dialog, Sheet, Drawer, AlertDialog, the
 * command palette) paints this, so they look identical and a Brand re-tints them
 * all through the `--overlay` color token (blur via `--overlay-blur`). Positioning
 * and stacking are included; callers add layout (e.g. flex centering) on top.
 */
export const overlayClasses = "fixed inset-0 z-50 bg-overlay backdrop-blur-(--overlay-blur)";
