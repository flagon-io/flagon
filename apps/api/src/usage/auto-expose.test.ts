import { describe, expect, it } from "vitest";
import { createSessionDedup } from "./session-dedup.js";

describe("createSessionDedup", () => {
  it("bills the first sight of a key and dedups within the window", () => {
    const d = createSessionDedup(1000);
    expect(d.markSeen("a", 0)).toBe(true); // new → bill
    expect(d.markSeen("a", 500)).toBe(false); // same session → dedup
    expect(d.markSeen("a", 999)).toBe(false); // still in window
    expect(d.markSeen("b", 500)).toBe(true); // a different key is its own session
  });

  it("bills again once the window has elapsed", () => {
    const d = createSessionDedup(1000);
    expect(d.markSeen("a", 0)).toBe(true);
    expect(d.markSeen("a", 1000)).toBe(true); // expiry is exclusive (exp > now false)
    expect(d.markSeen("a", 1500)).toBe(false); // new window started at 1000
  });

  it("evicts expired entries on the periodic sweep so it doesn't grow forever", () => {
    const d = createSessionDedup(1000);
    for (let i = 0; i < 100; i++) d.markSeen(`k${i}`, 0);
    expect(d.size()).toBe(100);
    // A mark past the 60s sweep interval, after everything expired, prunes the rest.
    d.markSeen("fresh", 120_000);
    expect(d.size()).toBe(1);
  });

  it("hard-resets if it blows the size cap (bounded memory)", () => {
    const d = createSessionDedup(1_000_000, 10);
    for (let i = 0; i < 11; i++) d.markSeen(`k${i}`, i); // 11 > cap 10
    expect(d.size()).toBeLessThanOrEqual(1);
  });

  it("clear() empties it", () => {
    const d = createSessionDedup(1000);
    d.markSeen("a", 0);
    d.clear();
    expect(d.size()).toBe(0);
    expect(d.markSeen("a", 0)).toBe(true);
  });
});
