import { describe, it, expect } from "vitest";
import { nextState } from "./state.js";
import type { Check } from "../db/schema.js";

/**
 * Unit tests for the check state machine (the hysteresis that decides "is a failure
 * real?"). Pure function, no DB — this is the logic most worth pinning down, since a
 * bug here means either alert spam or a missed outage.
 */
function mk(over: Partial<Check>): Check {
  return {
    status: "unknown",
    consecutiveFailures: 0,
    consecutiveSuccesses: 0,
    failureThreshold: 3,
    recoveryThreshold: 2,
    ...over,
  } as Check;
}

describe("nextState", () => {
  it("a brand-new check goes up on its first success (no threshold to clear from up)", () => {
    const s = nextState(mk({ status: "unknown" }), true);
    expect(s.status).toBe("up");
    expect(s.transition).toBeNull();
    expect(s.consecutiveSuccesses).toBe(1);
  });

  it("a single bad probe from up only reaches degraded — it does NOT alert", () => {
    const s = nextState(mk({ status: "up", consecutiveSuccesses: 5 }), false);
    expect(s.status).toBe("degraded");
    expect(s.transition).toBeNull();
    expect(s.consecutiveFailures).toBe(1);
    expect(s.consecutiveSuccesses).toBe(0);
  });

  it("does not confirm down until the failure threshold is reached", () => {
    const two = nextState(mk({ status: "degraded", consecutiveFailures: 2 }), false);
    expect(two.consecutiveFailures).toBe(3);
    expect(two.status).toBe("down");
    expect(two.transition).toBe("to_down");
  });

  it("fires to_down exactly once — a further failure while down does not re-fire", () => {
    const s = nextState(mk({ status: "down", consecutiveFailures: 3 }), false);
    expect(s.status).toBe("down");
    expect(s.transition).toBeNull();
  });

  it("recovery is asymmetric: one success while down stays degraded (pending)", () => {
    const s = nextState(mk({ status: "down", consecutiveSuccesses: 0, recoveryThreshold: 2 }), true);
    expect(s.status).toBe("degraded");
    expect(s.transition).toBeNull();
    expect(s.consecutiveSuccesses).toBe(1);
  });

  it("recovers with to_up only after the recovery threshold of consecutive successes", () => {
    const s = nextState(mk({ status: "down", consecutiveSuccesses: 1, recoveryThreshold: 2 }), true);
    expect(s.status).toBe("up");
    expect(s.transition).toBe("to_up");
  });

  it("a flap (up -> 1 fail -> success) never transitions, so it never pages", () => {
    const failed = nextState(mk({ status: "up", consecutiveSuccesses: 9 }), false);
    expect(failed.status).toBe("degraded");
    expect(failed.transition).toBeNull();
    const recovered = nextState(mk({ status: failed.status, consecutiveFailures: failed.consecutiveFailures, consecutiveSuccesses: failed.consecutiveSuccesses }), true);
    expect(recovered.status).toBe("up");
    expect(recovered.transition).toBeNull();
  });

  it("honors a failure threshold of 1 (page on the first failure)", () => {
    const s = nextState(mk({ status: "up", failureThreshold: 1, consecutiveSuccesses: 3 }), false);
    expect(s.status).toBe("down");
    expect(s.transition).toBe("to_down");
  });

  it("honors a recovery threshold of 1 (recover on the first success)", () => {
    const s = nextState(mk({ status: "down", recoveryThreshold: 1 }), true);
    expect(s.status).toBe("up");
    expect(s.transition).toBe("to_up");
  });

  it("counters reset on the opposite outcome", () => {
    const s = nextState(mk({ status: "degraded", consecutiveFailures: 2, consecutiveSuccesses: 0 }), true);
    expect(s.consecutiveFailures).toBe(0);
    expect(s.consecutiveSuccesses).toBe(1);
  });
});
