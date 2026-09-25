import { format as formatDate } from "date-fns";
import type { DateRange, Matcher } from "react-day-picker";

/**
 * Date helpers shared by DateField and DateRangeField: calendar bounds, the
 * min/max disabled-date matcher, range labels, and the per-day key a drag uses
 * to map a pointer to a date. Pure (no DOM), so they are unit tested directly.
 */

/** A local-calendar key for a day (`y-m-d`, month 0-based). Round-trips via parseDateKey. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Parse a `dateKey` back to local midnight of that day. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m, d);
}

/** Local midnight at the start of `d`'s day. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** The last millisecond of `d`'s day. */
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/**
 * A default calendar bound `delta` years from now: Jan 1 for a past bound, Dec
 * 31 for a future one, so the year dropdown spans whole years.
 */
export function yearsFromNow(delta: number, now: Date = new Date()): Date {
  return new Date(now.getFullYear() + delta, delta < 0 ? 0 : 11, delta < 0 ? 1 : 31);
}

/**
 * Build react-day-picker's disabled matcher from an inclusive min/max plus any
 * extra matcher(s). Undefined when nothing is disabled.
 */
export function rangeMatcher(min?: Date, max?: Date, extra?: Matcher | Matcher[]): Matcher[] | undefined {
  const m: Matcher[] = [];
  if (min) m.push({ before: startOfDay(min) });
  if (max) m.push({ after: endOfDay(max) });
  if (Array.isArray(extra)) m.push(...extra);
  else if (extra) m.push(extra);
  return m.length ? m : undefined;
}

/**
 * Label a range with a date-fns format. An open range reads "Aug 1, 2026 - ...";
 * a same-year range collapses the leading year: "Aug 1 - Aug 8, 2026".
 */
export function formatRange(range: DateRange | undefined, fmt: string): string {
  if (!range?.from) return "";
  if (!range.to) return `${formatDate(range.from, fmt)} - ...`;
  const sameYear = range.from.getFullYear() === range.to.getFullYear();
  const fromFmt = sameYear ? fmt.replace(/,?\s*yyyy/, "") : fmt;
  return `${formatDate(range.from, fromFmt)} - ${formatDate(range.to, fmt)}`;
}
