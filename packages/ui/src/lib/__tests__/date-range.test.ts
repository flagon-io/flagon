import { describe, expect, it } from "vitest";
import {
  dateKey,
  endOfDay,
  formatRange,
  parseDateKey,
  rangeMatcher,
  startOfDay,
  yearsFromNow,
} from "../date-range";

// Local-time constructors throughout, so the assertions are timezone-agnostic.
const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min);

describe("dateKey / parseDateKey", () => {
  it("round-trips a day, dropping the time of day", () => {
    const key = dateKey(d(2026, 8, 7, 15, 30));
    expect(key).toBe("2026-7-7");
    expect(parseDateKey(key).getTime()).toBe(d(2026, 8, 7).getTime());
  });

  it("gives distinct keys to distinct days", () => {
    expect(dateKey(d(2026, 1, 11))).not.toBe(dateKey(d(2026, 11, 1)));
  });
});

describe("startOfDay / endOfDay", () => {
  it("brackets the whole local day", () => {
    const noon = d(2026, 3, 14, 12);
    expect(startOfDay(noon).getTime()).toBe(d(2026, 3, 14).getTime());
    const end = endOfDay(noon);
    expect(end.getHours()).toBe(23);
    expect(end.getMilliseconds()).toBe(999);
    expect(end.getTime() + 1).toBe(d(2026, 3, 15).getTime());
  });
});

describe("yearsFromNow", () => {
  const now = d(2026, 6, 15);
  it("anchors a past bound to Jan 1", () => {
    expect(yearsFromNow(-5, now).getTime()).toBe(d(2021, 1, 1).getTime());
  });
  it("anchors a future bound to Dec 31", () => {
    expect(yearsFromNow(10, now).getTime()).toBe(d(2036, 12, 31).getTime());
  });
});

describe("rangeMatcher", () => {
  it("is undefined when nothing is disabled", () => {
    expect(rangeMatcher()).toBeUndefined();
    expect(rangeMatcher(undefined, undefined, [])).toBeUndefined();
  });

  it("makes min and max inclusive whole days", () => {
    const m = rangeMatcher(d(2026, 1, 10, 18), d(2026, 1, 20, 6));
    expect(m).toEqual([{ before: d(2026, 1, 10) }, { after: endOfDay(d(2026, 1, 20)) }]);
  });

  it("merges a single extra matcher or a list of them", () => {
    const weekend = { dayOfWeek: [0, 6] };
    expect(rangeMatcher(undefined, undefined, weekend)).toEqual([weekend]);
    const holiday = d(2026, 12, 25);
    expect(rangeMatcher(d(2026, 1, 1), undefined, [weekend, holiday])).toEqual([
      { before: d(2026, 1, 1) },
      weekend,
      holiday,
    ]);
  });
});

describe("formatRange", () => {
  const fmt = "MMM d, yyyy";
  it("is empty without a start", () => {
    expect(formatRange(undefined, fmt)).toBe("");
    expect(formatRange({ from: undefined }, fmt)).toBe("");
  });

  it("marks an open-ended range", () => {
    expect(formatRange({ from: d(2026, 8, 1) }, fmt)).toBe("Aug 1, 2026 - ...");
  });

  it("collapses the leading year within one year", () => {
    expect(formatRange({ from: d(2026, 8, 1), to: d(2026, 8, 8) }, fmt)).toBe("Aug 1 - Aug 8, 2026");
  });

  it("keeps both years across a year boundary", () => {
    expect(formatRange({ from: d(2026, 12, 28), to: d(2027, 1, 3) }, fmt)).toBe("Dec 28, 2026 - Jan 3, 2027");
  });
});
