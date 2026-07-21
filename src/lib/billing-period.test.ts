import { describe, it, expect } from "vitest";
import {
  addMonthsUTC,
  invoiceUsageWindow,
  calendarMonthPeriod,
  currentPeriodFor,
  formatPeriod,
  isCurrent,
  isoDay,
  periodLengthDays,
  previousPeriod,
  recentPeriods,
  subscriptionPeriod,
} from "./billing-period";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("period windows", () => {
  it("follows the org's own subscription cycle, not the calendar", () => {
    // The organization is the billing entity: an org that upgraded on the
    // 19th is billed the 19th to the 19th, and the usage page must say so.
    const window = currentPeriodFor({
      currentPeriodStart: day("2026-07-19"),
      currentPeriodEnd: day("2026-08-19"),
    });
    expect(isoDay(window.from)).toBe("2026-07-19");
    // Stripe's period end is EXCLUSIVE, so the last billed day is the 18th.
    // Treating it as inclusive would bill Aug 19 into two periods.
    expect(isoDay(window.to)).toBe("2026-08-18");
    expect(periodLengthDays(window)).toBe(31);
  });

  it("falls back to the calendar month with no subscription", () => {
    const window = currentPeriodFor({}, day("2026-07-20"));
    expect(isoDay(window.from)).toBe("2026-07-01");
    expect(isoDay(window.to)).toBe("2026-07-31");
    expect(window).toEqual(calendarMonthPeriod(day("2026-07-20")));
  });

  it("walks history back along the anniversary", () => {
    const current = subscriptionPeriod(day("2026-07-19"), day("2026-08-19"));
    const previous = previousPeriod(current);
    expect(isoDay(previous.from)).toBe("2026-06-19");
    // Ends the day before the current one starts: no gap, no overlap.
    expect(isoDay(previous.to)).toBe("2026-07-18");

    const windows = recentPeriods(current, 3);
    expect(windows.map((w) => isoDay(w.from))).toEqual([
      "2026-07-19",
      "2026-06-19",
      "2026-05-19",
      "2026-04-19",
    ]);
  });

  it("clamps month arithmetic instead of overflowing", () => {
    // Jan 31 minus a month is Jan 31 -> Dec 31, and Mar 31 -> Feb 28,
    // never a date that rolls into the following month.
    expect(isoDay(addMonthsUTC(day("2026-03-31"), -1))).toBe("2026-02-28");
    expect(isoDay(addMonthsUTC(day("2024-03-31"), -1))).toBe("2024-02-29");
    expect(isoDay(addMonthsUTC(day("2026-01-31"), -1))).toBe("2025-12-31");
    expect(isoDay(addMonthsUTC(day("2026-01-31"), 1))).toBe("2026-02-28");
  });

  it("bills the cycle the invoice's own period covers", () => {
    // Verified against a Stripe test clock (src/db/billing-invoice.test.ts):
    // a renewal opened on 19 Aug carries invoice.period = 19 Jul .. 19 Aug,
    // the cycle that ENDED, while its LINE period is the month ahead. The
    // arrears window is therefore the invoice's own period, up to the day
    // before it closes.
    //
    // THE BUG THIS EXISTS TO PREVENT: reading period_start as the start of the
    // cycle being opened and subtracting another month. That billed 19 Jun ..
    // 18 Jul - a month behind - so the elapsed cycle went unbilled and a
    // cancelled customer's last month never appeared on any invoice.
    const window = invoiceUsageWindow({
      periodStart: day("2026-07-19"),
      periodEnd: day("2026-08-19"),
    });
    expect(window).not.toBeNull();
    expect(isoDay(window!.from)).toBe("2026-07-19");
    expect(isoDay(window!.to)).toBe("2026-08-18");
  });

  it("has no usage window when no time has elapsed", () => {
    // A subscription_create invoice: period_start == period_end. Returning a
    // window here would invert it (to before from) and hand a backwards range
    // to the rollup query.
    expect(
      invoiceUsageWindow({
        periodStart: day("2026-07-19"),
        periodEnd: day("2026-07-19"),
      }),
    ).toBeNull();
  });

  it("knows whether a window is still open", () => {
    const window = subscriptionPeriod(day("2026-07-19"), day("2026-08-19"));
    expect(isCurrent(window, day("2026-07-19"))).toBe(true);
    expect(isCurrent(window, day("2026-08-18"))).toBe(true);
    expect(isCurrent(window, day("2026-08-19"))).toBe(false);
    expect(isCurrent(window, day("2026-07-18"))).toBe(false);
  });

  it("labels a period the way the invoice does", () => {
    expect(
      formatPeriod(subscriptionPeriod(day("2026-07-19"), day("2026-08-19"))),
    ).toBe("Jul 19, 2026 - Aug 18, 2026");
  });
});
