import { describe, expect, it } from "vitest";
import { activeStep, stepsToPage, resolveTargets, type EscalationLevel } from "./escalation.js";

const declared = new Date("2026-01-01T00:00:00Z");
const at = (min: number) => new Date(declared.getTime() + min * 60_000);

// level 0 pages immediately; escalate to 1 after 5 min; to 2 after +10 min.
const levels: EscalationLevel[] = [
  { position: 0, targetType: "schedule", targetId: "sched-1", delayMinutes: 5 },
  { position: 1, targetType: "team", targetId: "team-1", delayMinutes: 10 },
  { position: 2, targetType: "user", targetId: "cto", delayMinutes: 30 },
];

describe("activeStep", () => {
  it("climbs by cumulative delay (no repeat) and caps at the last level", () => {
    expect(activeStep(levels, 0, declared, null, at(0))?.step).toBe(0);
    expect(activeStep(levels, 0, declared, null, at(4))?.step).toBe(0);
    expect(activeStep(levels, 0, declared, null, at(5))?.step).toBe(1);
    expect(activeStep(levels, 0, declared, null, at(15))?.step).toBe(2);
    expect(activeStep(levels, 0, declared, null, at(999))?.step).toBe(2); // capped, no repeat
  });

  it("REPEATS the ladder when repeatCount > 0 (relentless paging)", () => {
    // sequence delays: [5,10,30, 5,10,30] -> cumulative [5,15,45, 50,60,90]
    expect(activeStep(levels, 1, declared, null, at(45))?.step).toBe(3); // back to level 0, 2nd cycle
    expect(activeStep(levels, 1, declared, null, at(45))?.level.position).toBe(0);
    expect(activeStep(levels, 1, declared, null, at(60))?.step).toBe(5); // level 2 again
    expect(activeStep(levels, 1, declared, null, at(999))?.step).toBe(5); // capped at end of repeats
  });

  it("stops escalating once acknowledged", () => {
    expect(activeStep(levels, 1, declared, at(3), at(100))).toBeNull();
  });

  it("returns null with no levels", () => {
    expect(activeStep([], 0, declared, null, at(10))).toBeNull();
  });
});

describe("stepsToPage (each newly-due step exactly once)", () => {
  // cumulative thresholds [5,15,45]
  it("pages EVERY skipped step, not just the frontier, when the cron jumps", () => {
    // Declare paged step 0 (afterStep=0). At 20 min the frontier is step 2, but
    // step 1's on-call must still be paged — a coarse/backlogged cron must not skip.
    const pending = stepsToPage(levels, 0, declared, null, at(20), 0);
    expect(pending.map((p) => p.step)).toEqual([1, 2]);
    expect(pending.map((p) => p.level.position)).toEqual([1, 2]);
  });

  it("returns nothing when already caught up to the frontier", () => {
    expect(stepsToPage(levels, 0, declared, null, at(20), 2)).toHaveLength(0);
    // Only step 0 is due yet (before the first threshold), and it was paged at declare.
    expect(stepsToPage(levels, 0, declared, null, at(4), 0)).toHaveLength(0);
  });

  it("pages just the next step on a fine-grained cron", () => {
    expect(stepsToPage(levels, 0, declared, null, at(6), 0).map((p) => p.step)).toEqual([1]);
  });

  it("walks the repeated ladder without skipping across the cycle boundary", () => {
    // repeat once: sequence delays [5,10,30, 5,10,30] -> cumulative [5,15,45,50,60,90].
    // From afterStep=2 (paged through the first cycle's last level) at 60 min, steps
    // 3,4,5 are all newly due and must each be paged.
    expect(stepsToPage(levels, 1, declared, null, at(60), 2).map((p) => p.step)).toEqual([3, 4, 5]);
  });

  it("is empty once acknowledged", () => {
    expect(stepsToPage(levels, 1, declared, at(3), at(100), 0)).toHaveLength(0);
  });
});

describe("resolveTargets", () => {
  const ctx = {
    scheduleOnCall: (id: string) => (id === "sched-1" ? "alice" : null),
    teamMembers: (id: string) => (id === "team-1" ? ["bob", "carol"] : []),
  };
  it("resolves schedule -> current on-call, team -> members, user -> itself", () => {
    expect(resolveTargets(levels[0], ctx)).toEqual(["alice"]);
    expect(resolveTargets(levels[1], ctx)).toEqual(["bob", "carol"]);
    expect(resolveTargets(levels[2], ctx)).toEqual(["cto"]);
  });
});
