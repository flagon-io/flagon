import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Proves the maintenance sweep deletes exactly the dead rows: expired
 * sessions and verification tokens, stale rate-limit counters - and nothing
 * that is still live. Skipped without a database, runs in CI.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
  process.env.DATABASE_URL_OWNER &&
  process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("maintenance sweep", () => {
  const stamp = Date.now();
  const tag = (name: string) => `sweep-${name}-${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM users WHERE email LIKE ${`sweep-%-${stamp}@example.com`}`;
      await owner`DELETE FROM verifications WHERE value LIKE ${`sweep-%-${stamp}`}`;
      await owner`DELETE FROM rate_limits WHERE key LIKE ${`sweep-%-${stamp}`}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("removes expired rows and keeps live ones", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    ({ closePool } = await import("@/db/client"));
    const { cleanupExpired } = await import("@/lib/maintenance");

    // A user to hang sessions off (FK).
    const [{ id: userId }] = await owner`
      INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
      VALUES (${tag("user")}, 'Sweep', ${`sweep-user-${stamp}@example.com`}, true, now(), now())
      RETURNING id
    `;

    await owner`
      INSERT INTO sessions (id, token, user_id, expires_at, created_at, updated_at)
      VALUES
        (${tag("s-dead")}, ${tag("t-dead")}, ${userId}, now() - interval '1 day', now(), now()),
        (${tag("s-live")}, ${tag("t-live")}, ${userId}, now() + interval '1 day', now(), now())
    `;
    await owner`
      INSERT INTO verifications (id, identifier, value, expires_at, created_at, updated_at)
      VALUES
        (${tag("v-dead")}, ${tag("vi-dead")}, ${tag("v-dead")}, now() - interval '1 hour', now(), now()),
        (${tag("v-live")}, ${tag("vi-live")}, ${tag("v-live")}, now() + interval '1 hour', now(), now())
    `;
    await owner`
      INSERT INTO rate_limits (id, key, count, last_request)
      VALUES
        (${tag("r-dead")}, ${tag("r-dead")}, 5, ${Date.now() - 48 * 60 * 60 * 1000}),
        (${tag("r-live")}, ${tag("r-live")}, 5, ${Date.now()})
    `;

    const removed = await cleanupExpired();
    expect(removed.sessions).toBeGreaterThanOrEqual(1);
    expect(removed.verifications).toBeGreaterThanOrEqual(1);
    expect(removed.rate_limits).toBeGreaterThanOrEqual(1);

    const [counts] = await owner`
      SELECT
        (SELECT count(*)::int FROM sessions WHERE id IN (${tag("s-dead")}, ${tag("s-live")})) AS sessions,
        (SELECT count(*)::int FROM verifications WHERE id IN (${tag("v-dead")}, ${tag("v-live")})) AS verifications,
        (SELECT count(*)::int FROM rate_limits WHERE id IN (${tag("r-dead")}, ${tag("r-live")})) AS rate_limits
    `;
    // Exactly the live row survives in each table.
    expect(counts).toEqual({ sessions: 1, verifications: 1, rate_limits: 1 });
  });
});
