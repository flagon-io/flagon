import { describe, expect, it } from "vitest";
import { nextState, type CheckStateInput } from "./state.js";
import type { CheckAlertTrigger } from "../db/schema.js";

/**
 * The alerting state machine is pure, so it is exhaustively table-testable without a
 * DB. These cases pin Checkly's semantics: run-based vs time-based thresholds,
 * reminder cadence, recovery only after an alert, and degraded handling.
 */

const base: CheckStateInput = {
  status: "unknown",
  consecutiveFailures: 0,
  consecutivePasses: 0,
  failingSince: null,
  alertState: "ok",
  lastAlertedAt: null,
  lastReminderAt: null,
};

const runCount = (runs: number, reminderMinutes?: number): CheckAlertTrigger => ({
  type: "run_count",
  runs,
  reminderMinutes,
});
const timeBased = (minutes: number, reminderMinutes?: number): CheckAlertTrigger => ({
  type: "time_based",
  minutes,
  reminderMinutes,
});

const now = new Date("2026-08-07T12:00:00Z");
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

describe("check state machine", () => {
  it("run_count(1): first failure fires an alert and starts alerting", () => {
    const t = nextState(base, "failing", { trigger: runCount(1), alertOnDegraded: false }, now);
    expect(t.status).toBe("failing");
    expect(t.consecutiveFailures).toBe(1);
    expect(t.alertState).toBe("alerting");
    expect(t.fire).toBe("alert");
    expect(t.failingSince).toEqual(now);
    expect(t.statusChanged).toBe(true);
  });

  it("run_count(2): alerts only on the second consecutive failure", () => {
    const first = nextState(base, "failing", { trigger: runCount(2), alertOnDegraded: false }, now);
    expect(first.fire).toBeNull();
    expect(first.consecutiveFailures).toBe(1);

    const second = nextState(
      { ...base, status: "failing", consecutiveFailures: 1, failingSince: minsAgo(1) },
      "failing",
      { trigger: runCount(2), alertOnDegraded: false },
      now,
    );
    expect(second.consecutiveFailures).toBe(2);
    expect(second.fire).toBe("alert");
    expect(second.alertState).toBe("alerting");
  });

  it("recovery fires once when a passing run follows an alert, and resets", () => {
    const alerting: CheckStateInput = {
      ...base,
      status: "failing",
      consecutiveFailures: 3,
      failingSince: minsAgo(10),
      alertState: "alerting",
      lastAlertedAt: minsAgo(10),
    };
    const t = nextState(alerting, "passing", { trigger: runCount(1), alertOnDegraded: false }, now);
    expect(t.fire).toBe("recovery");
    expect(t.alertState).toBe("ok");
    expect(t.consecutiveFailures).toBe(0);
    expect(t.consecutivePasses).toBe(1);
    expect(t.failingSince).toBeNull();
  });

  it("no recovery noise: a passing run while OK fires nothing", () => {
    const t = nextState(
      { ...base, status: "passing", consecutivePasses: 5 },
      "passing",
      { trigger: runCount(1), alertOnDegraded: false },
      now,
    );
    expect(t.fire).toBeNull();
    expect(t.alertState).toBe("ok");
  });

  it("time_based: alerts only once the failing window is exceeded", () => {
    const justStarted = nextState(base, "failing", { trigger: timeBased(5), alertOnDegraded: false }, now);
    expect(justStarted.fire).toBeNull();

    const longFailing = nextState(
      { ...base, status: "failing", consecutiveFailures: 4, failingSince: minsAgo(6) },
      "failing",
      { trigger: timeBased(5), alertOnDegraded: false },
      now,
    );
    expect(longFailing.fire).toBe("alert");
  });

  it("reminders re-fire on cadence while alerting", () => {
    const alerting: CheckStateInput = {
      ...base,
      status: "failing",
      consecutiveFailures: 5,
      failingSince: minsAgo(30),
      alertState: "alerting",
      lastAlertedAt: minsAgo(30),
      lastReminderAt: minsAgo(6),
    };
    const due = nextState(alerting, "failing", { trigger: runCount(1, 5), alertOnDegraded: false }, now);
    expect(due.fire).toBe("reminder");

    const notDue = nextState(
      { ...alerting, lastReminderAt: minsAgo(2) },
      "failing",
      { trigger: runCount(1, 5), alertOnDegraded: false },
      now,
    );
    expect(notDue.fire).toBeNull();
  });

  it("degraded counts as failing only when alertOnDegraded is set", () => {
    const ignored = nextState(base, "degraded", { trigger: runCount(1), alertOnDegraded: false }, now);
    expect(ignored.consecutiveFailures).toBe(0);
    expect(ignored.fire).toBeNull();

    const counted = nextState(base, "degraded", { trigger: runCount(1), alertOnDegraded: true }, now);
    expect(counted.consecutiveFailures).toBe(1);
    expect(counted.fire).toBe("alert");
  });
});
