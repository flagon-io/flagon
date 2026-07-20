import { randomBytes } from "node:crypto";
import { uuidv7 } from "./uuidv7";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { userEmails } from "@/db/schema";
import { user, verification } from "@/db/auth-schema";
import { brand } from "./brand";
import { sendEmail } from "./email";
import { renderBrandedEmail } from "./email-templates";

/**
 * Multi-email management. user_emails is the source of truth
 * for every address a user owns; "user".email mirrors the primary row so
 * BetterAuth's built-in flows (password reset, session user) keep working.
 * Hooks in src/lib/auth.ts keep the mirror in sync from the BetterAuth side;
 * these helpers keep it in sync from ours.
 *
 * Verification tokens live in BetterAuth's `verification` table under our own
 * identifier namespace, so they share expiry/cleanup semantics with the rest
 * of auth.
 */

const TOKEN_NAMESPACE = "user-email-verify";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, matching password reset links.

// Verification sends are throttled per address: outstanding tokens created in
// the window count against the cap (used tokens are deleted on verify).
const SEND_WINDOW_MS = 10 * 60 * 1000;
const SEND_MAX_PER_WINDOW = 3;

export type UserEmail = typeof userEmails.$inferSelect;

/** Public REST shape (snake_case), shared by the v1 routes. */
export function serializeEmail(e: UserEmail) {
  return {
    id: e.id,
    email: e.email,
    verified: e.verified,
    primary: e.isPrimary,
    created_at: e.createdAt.toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmailShape(email: string): boolean {
  // Light-touch: real validation is the verification link.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function listEmails(userId: string): Promise<UserEmail[]> {
  const rows = await db
    .select()
    .from(userEmails)
    .where(eq(userEmails.userId, userId));
  return rows.sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export async function findByEmail(email: string): Promise<UserEmail | null> {
  const [row] = await db
    .select()
    .from(userEmails)
    .where(sql`lower(${userEmails.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return row ?? null;
}

/**
 * Resolve the identifier a user typed at sign-in to the credential email
 * BetterAuth knows (the primary). Any VERIFIED address works; an unverified
 * alternate does not. Falls through to the raw input when
 * nothing matches so the caller still gets a uniform "invalid credentials"
 * failure without leaking which addresses exist.
 */
export async function resolveLoginEmail(email: string): Promise<string> {
  const row = await findByEmail(email);
  if (!row || (!row.isPrimary && !row.verified)) return email;
  const [owner] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1);
  return owner?.email ?? email;
}

/** True when the address exists anywhere (any user, either table). */
export async function emailTaken(email: string): Promise<boolean> {
  if (await findByEmail(email)) return true;
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return Boolean(existing);
}

async function createVerificationToken(emailId: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await db.insert(verification).values({
    id: uuidv7(),
    identifier: `${TOKEN_NAMESPACE}:${token}`,
    value: emailId,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    updatedAt: new Date(),
  });
  return token;
}

async function sendVerificationForRow(row: UserEmail): Promise<void> {
  const token = await createVerificationToken(row.id);
  const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const url = `${baseURL}/api/verify-email?token=${token}`;
  await sendEmail({
    to: row.email,
    subject: `Verify your ${brand.name} email address`,
    ...renderBrandedEmail({
      preview: "Confirm this address to add it to your account.",
      heading: "Verify this email address",
      paragraphs: [
        `This address was added to a ${brand.name} account. Confirm it belongs to you and it becomes available for signing in and notifications.`,
      ],
      cta: { label: "Verify email address", url },
      footnote:
        "The link expires in 1 hour. If you didn't add this address, you can safely ignore this email.",
    }),
  });
}

export type AddEmailResult =
  | { ok: true; email: UserEmail; sent: boolean }
  | { ok: false; error: "invalid" | "taken" | "unverified-primary" };

export async function addEmail(
  userId: string,
  rawEmail: string,
): Promise<AddEmailResult> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmailShape(email)) return { ok: false, error: "invalid" };

  // Prove you own the address you signed up with before growing the list.
  // (Sign-in with the unverified PRIMARY stays allowed so nobody is locked
  // out; this only gates adding more addresses.)
  const [primaryRow] = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.userId, userId), eq(userEmails.isPrimary, true)))
    .limit(1);
  if (primaryRow && !primaryRow.verified) {
    return { ok: false, error: "unverified-primary" };
  }

  if (await emailTaken(email)) return { ok: false, error: "taken" };

  const [row] = await db
    .insert(userEmails)
    .values({ id: uuidv7(), userId, email })
    .returning();

  // A provider rejection (bad recipient, provider outage) shouldn't lose the
  // added row; the user can hit "Resend" once the address/provider is sorted.
  let sent = true;
  try {
    await sendVerificationForRow(row);
  } catch (error) {
    sent = false;
    console.error("[user-emails] verification send failed:", error);
  }
  return { ok: true, email: row, sent };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function resendVerification(
  userId: string,
  emailId: string,
): Promise<ActionResult> {
  const [row] = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, error: "Email address not found." };
  if (row.verified)
    return { ok: false, error: "That email address is already verified." };

  // Email sends are the abuse vector here; cap them per address.
  const [{ recent }] = await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(verification)
    .where(
      and(
        like(verification.identifier, `${TOKEN_NAMESPACE}:%`),
        eq(verification.value, emailId),
        gte(verification.createdAt, new Date(Date.now() - SEND_WINDOW_MS)),
      ),
    );
  if (recent >= SEND_MAX_PER_WINDOW) {
    return {
      ok: false,
      error:
        "Too many verification emails sent to this address. Try again in a few minutes.",
    };
  }

  try {
    await sendVerificationForRow(row);
  } catch (error) {
    console.error("[user-emails] verification send failed:", error);
    return {
      ok: false,
      error: "Sending the verification email failed. Try again in a moment.",
    };
  }
  return { ok: true };
}

export async function verifyEmailToken(token: string): Promise<ActionResult> {
  const identifier = `${TOKEN_NAMESPACE}:${token}`;
  const [record] = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .limit(1);
  if (!record) return { ok: false, error: "invalid" };

  await db.delete(verification).where(eq(verification.id, record.id));
  if (record.expiresAt.getTime() < Date.now())
    return { ok: false, error: "expired" };

  const [row] = await db
    .update(userEmails)
    .set({ verified: true, updatedAt: new Date() })
    .where(eq(userEmails.id, record.value))
    .returning();
  if (!row) return { ok: false, error: "invalid" };

  // Verifying the primary also flips the BetterAuth mirror.
  if (row.isPrimary) {
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, row.userId));
  }
  return { ok: true };
}

export type SetPrimaryResult =
  | { ok: true; email: UserEmail }
  | { ok: false; error: string };

export async function setPrimary(
  userId: string,
  emailId: string,
): Promise<SetPrimaryResult> {
  const [row] = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, error: "Email address not found." };
  if (row.isPrimary)
    return { ok: false, error: "That is already your primary email." };
  if (!row.verified)
    return {
      ok: false,
      error: "Verify this email address before making it primary.",
    };

  await db.transaction(async (tx) => {
    // Drop the old primary flag first: a partial unique index enforces one
    // primary per user.
    await tx
      .update(userEmails)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(eq(userEmails.userId, userId), eq(userEmails.isPrimary, true)));
    await tx
      .update(userEmails)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(userEmails.id, emailId));
    await tx
      .update(user)
      .set({ email: row.email, emailVerified: true })
      .where(eq(user.id, userId));
  });
  const [updated] = await db
    .select()
    .from(userEmails)
    .where(eq(userEmails.id, emailId))
    .limit(1);
  return { ok: true, email: updated };
}

export async function removeEmail(
  userId: string,
  emailId: string,
): Promise<ActionResult> {
  const [row] = await db
    .select()
    .from(userEmails)
    .where(and(eq(userEmails.id, emailId), eq(userEmails.userId, userId)))
    .limit(1);
  if (!row) return { ok: false, error: "Email address not found." };
  if (row.isPrimary)
    return {
      ok: false,
      error:
        "You can't remove your primary email. Make another address primary first.",
    };
  await db.delete(userEmails).where(eq(userEmails.id, emailId));
  return { ok: true };
}
