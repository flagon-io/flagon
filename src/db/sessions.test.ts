import { describe, it, expect, afterAll } from "vitest";
import postgres from "postgres";

/**
 * Sessions list DEVICES, not sign-ins: signing in again from the same
 * browser supersedes that device's previous session instead of stacking a
 * new row. (A pile of identical rows is what a broken sign-in loop looked
 * like in production.) A different device stays listed separately.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
    process.env.DATABASE_URL_OWNER &&
    process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("device sessions", () => {
  const stamp = Date.now();
  const email = `sessions-${stamp}@example.com`;
  const password = "sessions-pw-1234";
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;

  const device = (ua: string, ip: string) =>
    new Headers({ "user-agent": ua, "x-forwarded-for": ip });

  const CHROME = () => device("Mozilla/5.0 Chrome/140 Windows", "203.0.113.7");

  afterAll(async () => {
    if (owner) {
      await owner`DELETE FROM users WHERE email = ${email}`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("keeps one session per device across repeated sign-ins", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const { auth } = await import("@/lib/auth");
    ({ closePool } = await import("@/db/client"));

    // Sign-up opens session #1 on this device.
    const signUp = await auth.api.signUpEmail({
      body: { email, password, name: "Session Tester", username: `sess${stamp}` },
      headers: CHROME(),
    });
    const userId = signUp.user.id;

    const countSessions = async () => {
      const [row] = await owner`
        SELECT count(*)::int AS count FROM sessions WHERE user_id = ${userId}
      `;
      return row.count as number;
    };
    expect(await countSessions()).toBe(1);

    // Signing in again from the same browser replaces it rather than
    // stacking: this is what produced 14 identical rows in production.
    for (let i = 0; i < 3; i++) {
      await auth.api.signInEmail({
        body: { email, password },
        headers: CHROME(),
      });
    }
    expect(await countSessions()).toBe(1);

    // A genuinely different device is its own row.
    await auth.api.signInEmail({
      body: { email, password },
      headers: device("Mozilla/5.0 Safari/18 iPhone", "198.51.100.22"),
    });
    expect(await countSessions()).toBe(2);

    // Same browser, different network: still a distinct device row (we only
    // supersede on an exact user-agent + IP match).
    await auth.api.signInEmail({
      body: { email, password },
      headers: device("Mozilla/5.0 Chrome/140 Windows", "198.51.100.99"),
    });
    expect(await countSessions()).toBe(3);
  });
});
