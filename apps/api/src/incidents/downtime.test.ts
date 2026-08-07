import { describe, expect, it } from "vitest";
import { platformDowntimeSeconds, weightedDowntimeSeconds } from "./downtime.js";

/**
 * The weighted-downtime interval sweep. Pure math (no DB): given incident intervals with
 * a severity weight, downtime is the integral of the max active weight, so overlapping
 * incidents never double-count and a zero-weight incident moves nothing.
 */
describe("weightedDowntimeSeconds", () => {
  it("is zero with no intervals", () => {
    expect(weightedDowntimeSeconds([])).toBe(0);
  });

  it("charges full weight for a single interval", () => {
    expect(weightedDowntimeSeconds([{ start: 0, end: 100, weight: 1 }])).toBe(100);
  });

  it("scales by weight", () => {
    expect(weightedDowntimeSeconds([{ start: 0, end: 100, weight: 0.25 }])).toBe(25);
  });

  it("ignores zero-weight (informational) incidents", () => {
    expect(weightedDowntimeSeconds([{ start: 0, end: 100, weight: 0 }])).toBe(0);
  });

  it("takes the MAX active weight over an overlap, never the sum", () => {
    // Two incidents fully covering [0,100]: weights 0.5 and 1 → the span counts once at 1.
    expect(
      weightedDowntimeSeconds([
        { start: 0, end: 100, weight: 0.5 },
        { start: 0, end: 100, weight: 1 },
      ]),
    ).toBe(100);
  });

  it("integrates the max weight across a partial overlap", () => {
    // [0,10]@1 and [5,15]@0.5 → 0-5:1 (5) + 5-10:max(1,0.5)=1 (5) + 10-15:0.5 (2.5) = 12.5
    expect(
      weightedDowntimeSeconds([
        { start: 0, end: 10, weight: 1 },
        { start: 5, end: 15, weight: 0.5 },
      ]),
    ).toBe(12.5);
  });

  it("sums disjoint intervals", () => {
    expect(
      weightedDowntimeSeconds([
        { start: 0, end: 10, weight: 1 },
        { start: 100, end: 110, weight: 0.5 },
      ]),
    ).toBe(15);
  });
});

/**
 * The PLATFORM axis: decoupled from per-service. `full` pins the whole platform down;
 * `proportional` counts affected-services / total share; `none` never touches the total.
 */
describe("platformDowntimeSeconds", () => {
  it("is zero when nothing contributes", () => {
    expect(platformDowntimeSeconds([], 14)).toBe(0);
    expect(platformDowntimeSeconds([{ projectId: "a", start: 0, end: 100, weight: 1, mode: "none" }], 14)).toBe(0);
  });

  it("a full-mode incident pins the whole platform down regardless of service count", () => {
    expect(platformDowntimeSeconds([{ projectId: "a", start: 0, end: 100, weight: 1, mode: "full" }], 14)).toBe(100);
  });

  it("a proportional incident counts affected/total (n/14)", () => {
    // 1 of 14 services, weight 1, for 140s → 140 * (1/14) = 10.
    expect(platformDowntimeSeconds([{ projectId: "a", start: 0, end: 140, weight: 1, mode: "proportional" }], 14)).toBe(10);
  });

  it("proportional incidents on distinct services add their shares", () => {
    // 2 of 14 services, each weight 1, for 140s → 140 * (2/14) = 20.
    expect(
      platformDowntimeSeconds(
        [
          { projectId: "a", start: 0, end: 140, weight: 1, mode: "proportional" },
          { projectId: "b", start: 0, end: 140, weight: 1, mode: "proportional" },
        ],
        14,
      ),
    ).toBe(20);
  });

  it("counts a project impacted BUT keeps it off the platform when mode is none", () => {
    // A none-mode incident: contributes to per-service downtime elsewhere, zero to platform.
    expect(platformDowntimeSeconds([{ projectId: "a", start: 0, end: 100, weight: 0.5, mode: "none" }], 14)).toBe(0);
  });

  it("full dominates a concurrent proportional incident", () => {
    expect(
      platformDowntimeSeconds(
        [
          { projectId: "a", start: 0, end: 100, weight: 1, mode: "full" },
          { projectId: "b", start: 0, end: 100, weight: 1, mode: "proportional" },
        ],
        14,
      ),
    ).toBe(100);
  });
});
