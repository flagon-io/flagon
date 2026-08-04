import { describe, expect, it } from "vitest";
import { activeStep, resolveTargets, type EscalationLevel } from "./escalation.js";

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
