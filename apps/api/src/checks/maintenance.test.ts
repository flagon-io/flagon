import { describe, expect, it } from "vitest";
import { isWindowActive, windowMatchesTags } from "./maintenance.js";

const at = (iso: string) => new Date(iso);

function win(startsAt: string, endsAt: string, repeat = "none", repeatEndsAt: string | null = null) {
  return {
    startsAt: at(startsAt),
    endsAt: at(endsAt),
    repeat: repeat as "none" | "daily" | "weekly" | "monthly",
    repeatEndsAt: repeatEndsAt ? at(repeatEndsAt) : null,
  };
}

describe("windowMatchesTags", () => {
  it("empty window tags match every check", () => {
    expect(windowMatchesTags([], [])).toBe(true);
    expect(windowMatchesTags([], ["api"])).toBe(true);
  });
  it("matches on tag intersection (any-of)", () => {
    expect(windowMatchesTags(["api", "web"], ["web"])).toBe(true);
    expect(windowMatchesTags(["api"], ["web"])).toBe(false);
    expect(windowMatchesTags(["api"], [])).toBe(false);
  });
});

describe("isWindowActive — none", () => {
  const w = win("2026-08-10T02:00:00Z", "2026-08-10T04:00:00Z");
  it("is active inside, inactive outside", () => {
    expect(isWindowActive(w, at("2026-08-10T01:59:00Z"))).toBe(false);
    expect(isWindowActive(w, at("2026-08-10T02:00:00Z"))).toBe(true);
    expect(isWindowActive(w, at("2026-08-10T03:30:00Z"))).toBe(true);
    expect(isWindowActive(w, at("2026-08-10T04:01:00Z"))).toBe(false);
  });
  it("rejects a zero/negative duration", () => {
    expect(isWindowActive(win("2026-08-10T02:00:00Z", "2026-08-10T02:00:00Z"), at("2026-08-10T02:00:00Z"))).toBe(false);
  });
});

describe("isWindowActive — daily", () => {
  const w = win("2026-08-01T02:00:00Z", "2026-08-01T03:00:00Z", "daily");
  it("recurs each day at the same time", () => {
    expect(isWindowActive(w, at("2026-08-15T02:30:00Z"))).toBe(true);
    expect(isWindowActive(w, at("2026-08-15T05:00:00Z"))).toBe(false);
    expect(isWindowActive(w, at("2026-07-31T02:30:00Z"))).toBe(false); // before first
  });
  it("stops after repeatEndsAt", () => {
    const bounded = win("2026-08-01T02:00:00Z", "2026-08-01T03:00:00Z", "daily", "2026-08-05T00:00:00Z");
    expect(isWindowActive(bounded, at("2026-08-03T02:30:00Z"))).toBe(true);
    expect(isWindowActive(bounded, at("2026-08-20T02:30:00Z"))).toBe(false);
  });
});

describe("isWindowActive — weekly & monthly", () => {
  it("weekly recurs every 7 days", () => {
    const w = win("2026-08-03T09:00:00Z", "2026-08-03T10:00:00Z", "weekly"); // a Monday
    expect(isWindowActive(w, at("2026-08-10T09:30:00Z"))).toBe(true);
    expect(isWindowActive(w, at("2026-08-11T09:30:00Z"))).toBe(false);
  });
  it("monthly recurs on the same day/time each month", () => {
    const w = win("2026-01-15T00:00:00Z", "2026-01-15T06:00:00Z", "monthly");
    expect(isWindowActive(w, at("2026-08-15T03:00:00Z"))).toBe(true);
    expect(isWindowActive(w, at("2026-08-16T03:00:00Z"))).toBe(false);
  });
});
