import { describe, it, expect, afterAll, vi, beforeAll } from "vitest";
import postgres from "postgres";

/**
 * Proves the multi-email lifecycle end to end against a real database:
 * sign-up seeds the primary row (databaseHooks), addresses can be added,
 * verified by token, promoted to primary (mirroring into users.email), and
 * resolved for sign-in. Skipped without a database, runs in CI.
 */
const canRun = Boolean(
  process.env.DATABASE_URL_APP &&
  process.env.DATABASE_URL_OWNER &&
  process.env.BETTER_AUTH_SECRET,
);

describe.skipIf(!canRun)("multi-email lifecycle", () => {
  const stamp = Date.now();
  const primaryEmail = `emails-${stamp}@example.com`;
  const altEmail = `emails-${stamp}-alt@example.com`;
  const username = `emails${stamp}`;
  let owner: ReturnType<typeof postgres>;
  let closePool: (() => Promise<void>) | undefined;
  let userId: string;

  beforeAll(() => {
    // Silence the console email provider's output in test logs.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (owner) {
      await owner`DELETE FROM users WHERE email IN (${primaryEmail}, ${altEmail})`;
      await owner.end();
    }
    if (closePool) await closePool();
  });

  it("runs the full add -> verify -> make primary -> sign-in flow", async () => {
    owner = postgres(process.env.DATABASE_URL_OWNER as string, { max: 1 });
    const { auth } = await import("@/lib/auth");
    ({ closePool } = await import("@/db/client"));
    const {
      addEmail,
      emailTaken,
      listEmails,
      removeEmail,
      resolveLoginEmail,
      setPrimary,
      verifyEmailToken,
    } = await import("@/lib/user-emails");

    // Sign-up seeds the primary row via the databaseHooks.
    const res = await auth.api.signUpEmail({
      body: {
        email: primaryEmail,
        password: "multi-email-pw-1",
        name: "Email Tester",
        username,
      },
    });
    userId = res.user.id;

    const emails = await listEmails(userId);
    expect(emails).toHaveLength(1);
    expect(emails[0].email).toBe(primaryEmail);
    expect(emails[0].isPrimary).toBe(true);
    expect(emails[0].verified).toBe(false);

    // Policy: no additional addresses until the primary is verified. Signing
    // in with the unverified primary still works (no lockout), which is why
    // the nag banner + this gate exist instead of blocking login.
    expect(await addEmail(userId, altEmail)).toEqual({
      ok: false,
      error: "unverified-primary",
    });

    // Verify the primary via a resent token; the users mirror follows.
    const { resendVerification } = await import("@/lib/user-emails");
    expect((await resendVerification(userId, emails[0].id)).ok).toBe(true);
    const [primaryToken] = await owner`
      SELECT identifier FROM verifications
      WHERE identifier LIKE 'user-email-verify:%' AND value = ${emails[0].id}
    `;
    expect(
      (
        await verifyEmailToken(
          (primaryToken.identifier as string).split(":")[1],
        )
      ).ok,
    ).toBe(true);
    const [afterPrimaryVerify] = await owner`
      SELECT email_verified FROM users WHERE id = ${userId}
    `;
    expect(afterPrimaryVerify.email_verified).toBe(true);

    // Seed an already-expired token: creating any new token purges expired
    // rows (opportunistic cleanup, no cron).
    const staleId = `stale-${stamp}`;
    await owner`
      INSERT INTO verifications (id, identifier, value, expires_at, updated_at)
      VALUES (${staleId}, ${`user-email-verify:${staleId}`}, 'stale',
              now() - interval '1 hour', now())
    `;

    // Add an alternate: unverified, taken, and NOT yet usable for sign-in.
    const added = await addEmail(userId, altEmail);
    expect(added.ok).toBe(true);

    const [{ stale }] = await owner`
      SELECT count(*)::int AS stale FROM verifications WHERE value = 'stale'
    `;
    expect(stale).toBe(0);
    expect(await emailTaken(altEmail)).toBe(true);
    expect(await resolveLoginEmail(altEmail)).toBe(altEmail);

    // Duplicate add is rejected.
    expect(await addEmail(userId, altEmail.toUpperCase())).toEqual({
      ok: false,
      error: "taken",
    });

    // Unverified addresses can't become primary.
    const altRow = (await listEmails(userId)).find((e) => !e.isPrimary)!;
    expect((await setPrimary(userId, altRow.id)).ok).toBe(false);

    // Verify via the emailed token (pull it straight from the verification
    // table, standing in for clicking the link).
    const [record] = await owner`
      SELECT identifier FROM verifications
      WHERE identifier LIKE 'user-email-verify:%' AND value = ${altRow.id}
    `;
    const token = (record.identifier as string).split(":")[1];
    expect((await verifyEmailToken(token)).ok).toBe(true);
    // Tokens are single-use.
    expect((await verifyEmailToken(token)).ok).toBe(false);

    // A verified alternate resolves to the account's login (primary) email.
    expect(await resolveLoginEmail(altEmail)).toBe(primaryEmail);
    expect(await resolveLoginEmail(altEmail.toUpperCase())).toBe(primaryEmail);

    // Promote it: the BetterAuth mirror follows.
    expect((await setPrimary(userId, altRow.id)).ok).toBe(true);
    const [mirrored] = await owner`
      SELECT email, email_verified FROM users WHERE id = ${userId}
    `;
    expect(mirrored.email).toBe(altEmail);
    expect(mirrored.email_verified).toBe(true);

    // Primary can't be removed; the demoted old address can.
    expect((await removeEmail(userId, altRow.id)).ok).toBe(false);
    const oldPrimary = (await listEmails(userId)).find((e) => !e.isPrimary)!;
    expect((await removeEmail(userId, oldPrimary.id)).ok).toBe(true);

    // Sign-up colliding with someone's alternate address is rejected.
    const relisted = await listEmails(userId);
    expect(relisted).toHaveLength(1);
    await addEmail(userId, `blocked-${stamp}@example.com`);
    await expect(
      auth.api.signUpEmail({
        body: {
          email: `blocked-${stamp}@example.com`,
          password: "multi-email-pw-2",
          name: "Thief",
          username: `thief${stamp}`,
        },
      }),
    ).rejects.toThrow();
    await owner`DELETE FROM user_emails WHERE email = ${`blocked-${stamp}@example.com`}`;
  });
});
