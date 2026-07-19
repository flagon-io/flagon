import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Proves BetterAuth sign-up works end to end (username + email + password),
 * writing a real row to the global user table. Runs only when a database and
 * auth secret are configured; otherwise skipped.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("auth sign-up", () => {
  let owner: ReturnType<typeof postgres>;
  let closePool: typeof import("@/db/client").closePool;
  const email = `signup-${Date.now()}@example.com`;
  const username = `user${Date.now()}`;

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM "user" WHERE email = ${email}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("creates a user with username + email + password", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const { auth } = await import("@/lib/auth");
    ({ closePool } = await import("@/db/client"));

    const res = await auth.api.signUpEmail({
      body: { email, password: "sup3r-secret-pw", name: "Test User", username },
    });

    expect(res.user.email).toBe(email);

    const [row] = await owner`
      SELECT email, username FROM "user" WHERE email = ${email}
    `;
    expect(row.email).toBe(email);
    expect(row.username).toBeTruthy();
  });
});
