import type { MaintenanceWindow } from "../db/schema.js";

/**
 * Maintenance-window evaluation. A window suppresses SCHEDULED monitoring for the checks
 * it targets while it is active; the sweep skips those checks so they never run and never
 * alert during planned maintenance. Two pure predicates + a small loader:
 *   - windowMatchesCheck: does this window target this check?
 *   - isWindowActive: is the window occurring at `now` (honoring repeat)?
 * Both are pure (take `now`) so they unit-test without a clock or DB.
 */

export type Repeat = "none" | "daily" | "weekly" | "monthly";

const DAY_MS = 86_400_000;

/** A window targets a check when it's in the window's selection; EMPTY selection = ALL checks. */
export function windowMatchesCheck(windowCheckKeys: string[], checkKey: string): boolean {
  return windowCheckKeys.length === 0 || windowCheckKeys.includes(checkKey);
}

/** Same calendar day-of-month/time shifted by `k` whole months (day may clamp forward). */
function addMonths(date: Date, k: number): Date {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + k);
  return d;
}

/**
 * Whether the window is occurring at `now`. For a non-repeating window that's simply
 * [startsAt, endsAt]. For a repeating one, the occurrence recurs from startsAt every
 * day/week/month until `repeatEndsAt` (null = forever); `now` is inside the window when it
 * falls within the most recent occurrence's [start, start+duration].
 */
export function isWindowActive(
  w: Pick<MaintenanceWindow, "startsAt" | "endsAt" | "repeat" | "repeatEndsAt">,
  now: Date,
): boolean {
  const start = w.startsAt.getTime();
  const durationMs = w.endsAt.getTime() - start;
  if (durationMs <= 0) return false;
  const t = now.getTime();
  if (t < start) return false;

  if (w.repeat === "none") return t <= w.endsAt.getTime();

  // The start of the occurrence that could currently contain `now`.
  let occStart: number;
  if (w.repeat === "daily" || w.repeat === "weekly") {
    const period = w.repeat === "daily" ? DAY_MS : 7 * DAY_MS;
    const n = Math.floor((t - start) / period);
    occStart = start + n * period;
  } else if (w.repeat === "monthly") {
    let k = (now.getFullYear() - w.startsAt.getFullYear()) * 12 + (now.getMonth() - w.startsAt.getMonth());
    if (addMonths(w.startsAt, k).getTime() > t) k -= 1;
    if (k < 0) return false;
    occStart = addMonths(w.startsAt, k).getTime();
  } else {
    return false;
  }

  if (w.repeatEndsAt && occStart > w.repeatEndsAt.getTime()) return false;
  return t <= occStart + durationMs;
}

/** The org's windows that are active right now. (Lazy DB import keeps this file
 *  importable — for the pure predicates above — without a database.) */
export async function activeWindows(orgId: string, now: Date): Promise<MaintenanceWindow[]> {
  const { withOrg } = await import("../db/tenant.js");
  const { maintenanceWindows } = await import("../db/schema.js");
  const rows = await withOrg(orgId, (tx) => tx.select().from(maintenanceWindows));
  return rows.filter((w) => isWindowActive(w, now));
}

/** Whether any active window currently targets this check. */
export function anyWindowSuppresses(windows: MaintenanceWindow[], checkKey: string): boolean {
  return windows.some((w) => windowMatchesCheck(w.checkKeys, checkKey));
}
