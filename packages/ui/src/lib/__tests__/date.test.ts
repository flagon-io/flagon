import { describe, expect, it } from "vitest";
import { parseFlexibleDate } from "../../components/date-field";

// Assert on Y/M/D parts rather than a timestamp to stay timezone-agnostic.
function ymd(d: Date | null): [number, number, number] | null {
  return d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null;
}

describe("parseFlexibleDate", () => {
  it("returns null for empty or unparseable input", () => {
    expect(parseFlexibleDate("")).toBeNull();
    expect(parseFlexibleDate("   ")).toBeNull();
    expect(parseFlexibleDate("not a date")).toBeNull();
    expect(parseFlexibleDate("7")).toBeNull(); // single number is too ambiguous
  });

  it("parses ISO dates", () => {
    expect(ymd(parseFlexibleDate("2026-09-17"))).toEqual([2026, 9, 17]);
  });

  it("accepts slashes, dots, and hyphens", () => {
    expect(ymd(parseFlexibleDate("09/17/2026"))).toEqual([2026, 9, 17]);
    expect(ymd(parseFlexibleDate("09.17.2026"))).toEqual([2026, 9, 17]);
    expect(ymd(parseFlexibleDate("2026/09/17"))).toEqual([2026, 9, 17]);
  });

  it("expands 2-digit years", () => {
    const parts = ymd(parseFlexibleDate("09/17/26"));
    expect(parts?.[0]).toBe(2026);
  });

  it("respects dayFirst for ambiguous numeric dates", () => {
    expect(ymd(parseFlexibleDate("01/02/2026", { dayFirst: false }))).toEqual([2026, 1, 2]);
    expect(ymd(parseFlexibleDate("01/02/2026", { dayFirst: true }))).toEqual([2026, 2, 1]);
  });

  it("falls back to the possible order when one is impossible", () => {
    // 13 cannot be a month, so it must be the day regardless of dayFirst=false.
    expect(ymd(parseFlexibleDate("13/01/2026", { dayFirst: false }))).toEqual([2026, 1, 13]);
  });

  it("parses month names", () => {
    expect(ymd(parseFlexibleDate("Sep 17 2026"))).toEqual([2026, 9, 17]);
  });
});
