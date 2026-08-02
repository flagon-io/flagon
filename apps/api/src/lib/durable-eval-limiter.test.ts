import { describe, expect, it } from "vitest";
import { createDurableEvalLimiter } from "./durable-eval-limiter.js";
import type { ReserveResult } from "./rate-limit.js";

/**
 * An in-memory stand-in for the Postgres reserve: a fixed-window counter that
 * counts calls, so a test can assert both the enforcement and how many database
 * round-trips the reservation buffer actually made.
 */
function fakeDurable(limit: number, windowMs: number, clock: () => number) {
  const state = new Map<string, { count: number; resetAtMs: number }>();
  let calls = 0;
  const reserve = async ({
    key,
    amount,
  }: {
    key: string;
    amount: number;
    limit: number;
    windowSeconds: number;
  }): Promise<ReserveResult> => {
    calls++;
    const t = clock();
    let s = state.get(key);
    if (!s || s.resetAtMs <= t) {
      s = { count: 0, resetAtMs: t + windowMs };
      state.set(key, s);
    }
    const before = s.count;
    s.count += amount;
    const granted = Math.max(0, Math.min(amount, limit - before));
    return {
      granted,
      limit,
      resetAtMs: s.resetAtMs,
      retryAfterSeconds: granted > 0 ? 0 : Math.max(1, Math.ceil((s.resetAtMs - t) / 1000)),
    };
  };
  return { reserve, calls: () => calls };
}

describe("createDurableEvalLimiter", () => {
  it("amortizes: one reservation serves a whole chunk of evals", async () => {
    const clock = () => 1000;
    const durable = fakeDurable(100, 60_000, clock);
    const rl = createDurableEvalLimiter({
      limit: 100,
      windowSeconds: 60,
      chunk: 5,
      now: clock,
      reserve: durable.reserve,
    });

    for (let i = 0; i < 5; i++) expect((await rl.check("k")).ok).toBe(true);
    expect(durable.calls()).toBe(1); // 5 evals, 1 database round-trip

    expect((await rl.check("k")).ok).toBe(true); // 6th drains a fresh batch
    expect(durable.calls()).toBe(2);
  });

  it("enforces the global limit and then blocks from memory", async () => {
    const clock = () => 1000;
    const durable = fakeDurable(3, 60_000, clock);
    const rl = createDurableEvalLimiter({
      limit: 3,
      windowSeconds: 60,
      chunk: 10,
      now: clock,
      reserve: durable.reserve,
    });

    const results = [];
    for (let i = 0; i < 5; i++) results.push((await rl.check("k")).ok);

    expect(results).toEqual([true, true, true, false, false]);
    // One reserve to claim the 3 available, one that comes back empty; after
    // that the key is blocked in memory, so no further round-trips.
    expect(durable.calls()).toBe(2);
  });

  it("returns a Retry-After when blocked", async () => {
    const clock = () => 1000;
    const durable = fakeDurable(1, 30_000, clock);
    const rl = createDurableEvalLimiter({
      limit: 1,
      windowSeconds: 30,
      chunk: 1,
      now: clock,
      reserve: durable.reserve,
    });

    expect((await rl.check("k")).ok).toBe(true);
    const blocked = await rl.check("k");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("recovers after the window rolls over", async () => {
    let t = 1000;
    const durable = fakeDurable(1, 10_000, () => t);
    const rl = createDurableEvalLimiter({
      limit: 1,
      windowSeconds: 10,
      chunk: 1,
      now: () => t,
      reserve: durable.reserve,
    });

    expect((await rl.check("k")).ok).toBe(true);
    expect((await rl.check("k")).ok).toBe(false);

    t += 11_000; // next window
    expect((await rl.check("k")).ok).toBe(true);
  });

  it("keys are independent", async () => {
    const clock = () => 1000;
    const durable = fakeDurable(1, 60_000, clock);
    const rl = createDurableEvalLimiter({
      limit: 1,
      windowSeconds: 60,
      chunk: 1,
      now: clock,
      reserve: durable.reserve,
    });

    expect((await rl.check("a")).ok).toBe(true);
    expect((await rl.check("b")).ok).toBe(true); // different key, own budget
    expect((await rl.check("a")).ok).toBe(false);
  });

  it("honors a per-call limit override (plan-scoped ceiling)", async () => {
    const clock = () => 1000;
    // An inline reserve that enforces the PER-CALL limit (and records it), so the
    // test proves the override is threaded through to the durable layer, not just
    // reflected in the result.
    const counts = new Map<string, number>();
    let lastLimitSeen = 0;
    const reserve = async ({
      key,
      amount,
      limit,
      windowSeconds,
    }: {
      key: string;
      amount: number;
      limit: number;
      windowSeconds: number;
    }): Promise<ReserveResult> => {
      lastLimitSeen = limit;
      const before = counts.get(key) ?? 0;
      counts.set(key, before + amount);
      const granted = Math.max(0, Math.min(amount, limit - before));
      return {
        granted,
        limit,
        resetAtMs: clock() + windowSeconds * 1000,
        retryAfterSeconds: granted > 0 ? 0 : windowSeconds,
      };
    };
    const rl = createDurableEvalLimiter({
      limit: 999, // the paid default; the override should win
      windowSeconds: 60,
      chunk: 1,
      now: clock,
      reserve,
    });

    // A tight Hobby-style ceiling of 2 for this key.
    expect((await rl.check("hobby-key", 2)).ok).toBe(true);
    expect((await rl.check("hobby-key", 2)).ok).toBe(true);
    const blocked = await rl.check("hobby-key", 2);
    expect(blocked.ok).toBe(false);
    expect(blocked.limit).toBe(2); // the effective (overridden) limit, not 999
    expect(lastLimitSeen).toBe(2); // the override reached the reserve layer

    // A different key with no override still gets the full default.
    expect((await rl.check("paid-key")).ok).toBe(true);
    expect(lastLimitSeen).toBe(999);
  });

  it("fails open when the durable store errors (grants the batch)", async () => {
    const clock = () => 1000;
    const rl = createDurableEvalLimiter({
      limit: 1,
      windowSeconds: 60,
      chunk: 4,
      now: clock,
      // Simulate the fail-open contract of reserveRateLimit: grant everything.
      reserve: async ({ amount, limit, windowSeconds }) => ({
        granted: amount,
        limit,
        resetAtMs: clock() + windowSeconds * 1000,
        retryAfterSeconds: 0,
      }),
    });

    for (let i = 0; i < 8; i++) expect((await rl.check("k")).ok).toBe(true);
  });
});
