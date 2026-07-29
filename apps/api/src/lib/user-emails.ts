import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, userEmails } from "../db/auth-tables.js";

/**
 * Resolve any VERIFIED address to the owning account's primary email. The API's
 * BetterAuth sign-in hook uses this so a user can authenticate with any of their
 * verified addresses (GitHub-style): the entered address is mapped to the
 * primary, which is what the password is checked against. Unknown or unverified
 * addresses pass straight through unchanged, so this never reveals whether an
 * address exists. Ported from apps/app/src/lib/user-emails.ts.
 */
export async function resolvePrimaryEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({ userId: userEmails.userId, verified: userEmails.verified })
    .from(userEmails)
    .where(eq(userEmails.email, normalized))
    .limit(1);
  const row = rows[0];
  if (!row || !row.verified) return normalized;

  const primary = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  return primary[0]?.email ?? normalized;
}

/** All of a user's emails, primary first then by age. */
export async function listUserEmails(userId: string) {
  const rows = await db
    .select()
    .from(userEmails)
    .where(eq(userEmails.userId, userId));
  return rows.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** True when the address already belongs to some account (any verification). */
export async function emailExists(email: string): Promise<boolean> {
  const rows = await db
    .select({ id: userEmails.id })
    .from(userEmails)
    .where(eq(userEmails.email, email.trim().toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

/**
 * Promote a verified address to primary: flip the flags in `user_emails` and
 * mirror the new primary onto `users.email`. Guards that it is the user's and
 * verified.
 */
export async function setPrimaryEmail(userId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.email, normalized)))
    .limit(1);
  const target = rows[0];
  if (!target) throw new Error("That email is not on your account.");
  if (!target.verified)
    throw new Error("Verify this email before making it primary.");

  await db.transaction(async (tx) => {
    await tx
      .update(userEmails)
      .set({ isPrimary: false })
      .where(eq(userEmails.userId, userId));
    await tx
      .update(userEmails)
      .set({ isPrimary: true })
      .where(eq(userEmails.id, target.id));
    await tx
      .update(users)
      .set({ email: normalized, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });
}
