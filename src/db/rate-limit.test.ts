import { describe, it, expect, beforeAll, afterAll } from "vitest";
import postgres from "postgres";

/**
 * The shared rate limiter, against a real database.
 *
 * The property that matters is that the counter is SHARED: every stateless
 * instance sees the same window, so the ceiling is the ceiling and not
 * limit x instances. That can only be checked against a real row, so this runs
 * against Postgres rather than a mock.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP && process.env.DATABASE_URL_OWNER,
);

describe.skipIf(!canRun)("rate limiter", () => {
  const stamp = Date.now();
  const key = `test:rate:${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let rateLimit: typeof import("@/lib/rate-limit.server").rateLimit;

  beforeAll(async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 2 });
    ({ closePool } = await import("@/db/client"));
    ({ rateLimit } = await import("@/lib/rate-limit.server"));
  });

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM rate_limits WHERE key LIKE ${"test:rate:%"}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("allows up to the limit, then refuses", async () => {
    const now = 1_000_000;
    const opts = { key, limit: 3, windowSeconds: 60, now };
    expect((await rateLimit(opts)).ok).toBe(true); // 1
    expect((await rateLimit(opts)).ok).toBe(true); // 2
    const third = await rateLimit(opts);
    expect(third.ok).toBe(true); // 3
    expect(third.remaining).toBe(0);
    const fourth = await rateLimit(opts);
    expect(fourth.ok).toBe(false); // over
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets once the window elapses", async () => {
    const key2 = `test:rate:reset:${stamp}`;
    const base = 2_000_000;
    // Exhaust a window of 1.
    expect(
      (await rateLimit({ key: key2, limit: 1, windowSeconds: 60, now: base }))
        .ok,
    ).toBe(true);
    expect(
      (
        await rateLimit({
          key: key2,
          limit: 1,
          windowSeconds: 60,
          now: base + 1000,
        })
      ).ok,
    ).toBe(false);
    // A full window later, the counter starts fresh.
    expect(
      (
        await rateLimit({
          key: key2,
          limit: 1,
          windowSeconds: 60,
          now: base + 61_000,
        })
      ).ok,
    ).toBe(true);
  });

  it("keeps separate keys independent", async () => {
    const a = `test:rate:a:${stamp}`;
    const b = `test:rate:b:${stamp}`;
    const now = 3_000_000;
    await rateLimit({ key: a, limit: 1, windowSeconds: 60, now });
    // a is now exhausted, but b is untouched.
    expect(
      (await rateLimit({ key: a, limit: 1, windowSeconds: 60, now })).ok,
    ).toBe(false);
    expect(
      (await rateLimit({ key: b, limit: 1, windowSeconds: 60, now })).ok,
    ).toBe(true);
  });
});
