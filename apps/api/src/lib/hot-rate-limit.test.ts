import { describe, expect, it } from "vitest";
import { createHotRateLimiter } from "./hot-rate-limit.js";

describe("createHotRateLimiter", () => {
  it("allows up to the limit, then blocks within the window", () => {
    let t = 1_000_000;
    const rl = createHotRateLimiter({ limit: 3, windowSeconds: 60, now: () => t });

    expect(rl.check("k").ok).toBe(true); // 1
    expect(rl.check("k").ok).toBe(true); // 2
    const third = rl.check("k"); // 3
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const blocked = rl.check("k"); // 4
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    let t = 0;
    const rl = createHotRateLimiter({ limit: 1, windowSeconds: 10, now: () => t });

    expect(rl.check("k").ok).toBe(true);
    expect(rl.check("k").ok).toBe(false);

    t += 10_000; // window boundary
    expect(rl.check("k").ok).toBe(true);
  });

  it("tracks keys independently", () => {
    let t = 0;
    const rl = createHotRateLimiter({ limit: 1, windowSeconds: 10, now: () => t });

    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
    expect(rl.check("b").ok).toBe(true); // b has its own window
  });

  it("reports decreasing remaining and never negative", () => {
    let t = 0;
    const rl = createHotRateLimiter({ limit: 2, windowSeconds: 10, now: () => t });
    expect(rl.check("k").remaining).toBe(1);
    expect(rl.check("k").remaining).toBe(0);
    expect(rl.check("k").remaining).toBe(0);
  });
});
