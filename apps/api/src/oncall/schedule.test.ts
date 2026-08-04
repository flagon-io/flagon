import { describe, expect, it } from "vitest";
import { resolveOnCall, type Member, type Override } from "./schedule.js";

const anchor = new Date("2026-01-01T00:00:00Z");
const members: Member[] = [
  { userId: "alice", position: 0 },
  { userId: "bob", position: 1 },
];
const sched = { rotationIntervalHours: 24, anchorAt: anchor };

describe("resolveOnCall", () => {
  it("returns the first member at the anchor and rotates each interval", () => {
    expect(resolveOnCall(sched, members, [], anchor)).toMatchObject({ current: "alice", next: "bob", source: "rotation" });
    expect(resolveOnCall(sched, members, [], new Date("2026-01-02T00:00:00Z")).current).toBe("bob");
    expect(resolveOnCall(sched, members, [], new Date("2026-01-03T00:00:00Z")).current).toBe("alice");
  });

  it("handles a time before the anchor without going out of range", () => {
    const r = resolveOnCall(sched, members, [], new Date("2025-12-31T00:00:00Z"));
    expect(["alice", "bob"]).toContain(r.current);
  });

  it("an active override wins over the rotation", () => {
    const overrides: Override[] = [
      { userId: "carol", startsAt: new Date("2026-01-01T00:00:00Z"), endsAt: new Date("2026-01-01T12:00:00Z") },
    ];
    const during = resolveOnCall(sched, members, overrides, new Date("2026-01-01T06:00:00Z"));
    expect(during).toMatchObject({ current: "carol", source: "override" });
    // after the override window, back to the rotation
    expect(resolveOnCall(sched, members, overrides, new Date("2026-01-01T18:00:00Z")).current).toBe("alice");
  });

  it("with no members, falls back to an override or none", () => {
    expect(resolveOnCall(sched, [], [], anchor)).toMatchObject({ current: null, source: "none" });
    const overrides: Override[] = [
      { userId: "carol", startsAt: anchor, endsAt: new Date("2026-01-02T00:00:00Z") },
    ];
    expect(resolveOnCall(sched, [], overrides, anchor)).toMatchObject({ current: "carol", source: "override" });
  });
});
