/**
 * Period windows: WHICH days a bill covers.
 *
 * The organization is the billing entity, so every org runs on its OWN
 * subscription cycle. An org that upgraded on the 19th is billed the 19th to
 * the 19th, and the usage page has to show exactly that window - showing a
 * calendar month while Stripe invoices an anniversary cycle means the console
 * and the invoice quote different numbers for the same month, which is the
 * one thing a usage page must never do.
 *
 * Until an org has a subscription (free orgs, self-host, pre-Stripe
 * deployments) there is no cycle to follow, so the calendar month is the
 * honest, explainable default.
 *
 * PURE DATA MATH: no database, no Stripe, importable from client components.
 * Windows are INCLUSIVE day ranges, matching the usage_rollups grain.
 */
export type PeriodWindow = {
  /** First day of the period, inclusive. */
  from: Date;
  /** Last day of the period, inclusive. */
  to: Date;
};

/** ISO day (YYYY-MM-DD) - the rollup grain, and how periods are keyed. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight UTC on the day `date` falls in. */
export function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addDaysUTC(date: Date, days: number): Date {
  const next = startOfDayUTC(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Month arithmetic that clamps instead of overflowing: Jan 31 minus one month
 * is Dec 31, and Mar 31 minus one month is Feb 28 (or 29), not Mar 2. Stripe
 * anchors long months the same way, so history navigation lines up with the
 * invoices it is describing.
 */
export function addMonthsUTC(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const lastDayOfTarget = new Date(
    Date.UTC(year, month + months + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(year, month + months, Math.min(day, lastDayOfTarget)),
  );
}

/** The calendar month `now` falls in. The default when there's no cycle. */
export function calendarMonthPeriod(now = new Date()): PeriodWindow {
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)),
  };
}

/**
 * A subscription cycle as an inclusive day window.
 *
 * Stripe's `current_period_end` is EXCLUSIVE (it is the instant the next
 * period begins), so the last billed day is the day before it. Getting this
 * wrong double-counts one day of usage into two periods.
 */
export function subscriptionPeriod(start: Date, end: Date): PeriodWindow {
  return { from: startOfDayUTC(start), to: addDaysUTC(end, -1) };
}

/**
 * The window an org is currently accruing into: its subscription cycle when
 * it has one, otherwise the calendar month.
 */
export function currentPeriodFor(
  org: { currentPeriodStart?: Date | null; currentPeriodEnd?: Date | null },
  now = new Date(),
): PeriodWindow {
  if (org.currentPeriodStart && org.currentPeriodEnd) {
    return subscriptionPeriod(org.currentPeriodStart, org.currentPeriodEnd);
  }
  return calendarMonthPeriod(now);
}

/**
 * The window immediately before this one: same anniversary day, one month
 * back, ending the day before this one starts. Chaining it walks history
 * without needing a row for every period that ever existed.
 */
export function previousPeriod(window: PeriodWindow): PeriodWindow {
  return {
    from: addMonthsUTC(window.from, -1),
    to: addDaysUTC(window.from, -1),
  };
}

/** This period plus the `count` before it, newest first. */
export function recentPeriods(
  current: PeriodWindow,
  count: number,
): PeriodWindow[] {
  const windows = [current];
  for (let i = 0; i < count; i += 1) {
    windows.push(previousPeriod(windows[windows.length - 1]));
  }
  return windows;
}

/**
 * The usage window a subscription invoice should carry.
 *
 * Stripe's recurring invoice bills the base fee for the period it is OPENING
 * (`period_start` is in the future relative to the service already rendered).
 * Usage is billed in ARREARS, so the days that belong on this invoice are the
 * cycle that just ended: up to the day before the new one starts.
 *
 * Reading the invoice's own period as the usage window - which is the obvious
 * and wrong thing to do - bills an empty future window and never charges for
 * anything.
 */
export function arrearsPeriodFor(invoicePeriodStart: Date): PeriodWindow {
  const nextCycleStart = startOfDayUTC(invoicePeriodStart);
  return {
    from: addMonthsUTC(nextCycleStart, -1),
    to: addDaysUTC(nextCycleStart, -1),
  };
}

/** Whether `now` falls inside the window (open period detection). */
export function isCurrent(window: PeriodWindow, now = new Date()): boolean {
  const day = isoDay(now);
  return day >= isoDay(window.from) && day <= isoDay(window.to);
}

/** Whole days in the window, inclusive. */
export function periodLengthDays(window: PeriodWindow): number {
  const ms =
    startOfDayUTC(window.to).getTime() - startOfDayUTC(window.from).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

const RANGE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "Jul 19, 2026 - Aug 18, 2026" */
export function formatPeriod(window: PeriodWindow): string {
  return `${RANGE_FORMAT.format(window.from)} - ${RANGE_FORMAT.format(window.to)}`;
}

/** Stable key for a period in URLs and API params: its first day. */
export function periodKey(window: PeriodWindow): string {
  return isoDay(window.from);
}
