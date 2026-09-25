import { randomBytes, randomUUID } from "node:crypto";
import { pool } from "@/lib/db";
import { HttpError } from "@/lib/http-error";

export interface UserEmail {
  id: string;
  email: string;
  verified: boolean;
  isPrimary: boolean;
  createdAt: string;
}

const OTP_TTL_MS = 30 * 60 * 1000; // 30 minutes, matches the emailOTP plugin.

function generateOtp() {
  return String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
}

// Called once from a BetterAuth databaseHooks.user.create.after hook so every
// account has a row here mirroring its first, already-verified email.
export async function createPrimaryUserEmail(
  userId: string,
  email: string,
  verified: boolean,
) {
  await pool.query(
    `insert into user_emails (id, user_id, email, verified, is_primary)
     values ($1, $2, $3, $4, true)
     on conflict (email) do nothing`,
    [randomUUID(), userId, email, verified],
  );
}

// Called from databaseHooks.user.update.after to keep the primary row in
// sync whenever BetterAuth itself changes user.email or user.emailVerified
// (e.g. its own email-verification flow, not our /api/emails endpoints).
export async function syncPrimaryUserEmail(
  userId: string,
  email: string,
  verified: boolean,
) {
  await pool.query(
    `insert into user_emails (id, user_id, email, verified, is_primary)
     values ($1, $2, $3, $4, true)
     on conflict (email) do update set verified = $4, updated_at = now()`,
    [randomUUID(), userId, email, verified],
  );
}

export async function listUserEmails(userId: string): Promise<UserEmail[]> {
  const { rows } = await pool.query(
    `select id, email, verified, is_primary as "isPrimary", created_at as "createdAt"
     from user_emails where user_id = $1 order by is_primary desc, created_at asc`,
    [userId],
  );
  return rows;
}

// Starts adding a new (unverified, non-primary) email and returns the OTP to
// send. Fails if the email is already claimed by anyone.
export async function requestAddUserEmail(userId: string, email: string) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const { rowCount } = await pool.query(
    `insert into user_emails (id, user_id, email, verified, is_primary, otp, otp_expires_at)
     values ($1, $2, $3, false, false, $4, $5)
     on conflict (email) do nothing`,
    [randomUUID(), userId, email, otp, expiresAt],
  );

  if (rowCount === 0) {
    throw new HttpError(409, "That email is already in use.");
  }

  return otp;
}

// Regenerates and returns a fresh OTP for a pending (unverified) secondary email,
// so the caller can re-send it. Errors if there's no such pending email.
export async function resendUserEmailOtp(userId: string, email: string) {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const { rows } = await pool.query(
    `update user_emails
     set otp = $3, otp_expires_at = $4, updated_at = now()
     where user_id = $1 and email = $2 and verified = false
     returning id`,
    [userId, email, otp, expiresAt],
  );

  if (rows.length === 0) {
    throw new HttpError(404, "No pending verification for that email.");
  }

  return otp;
}

export async function verifyUserEmailOtp(userId: string, email: string, otp: string) {
  const { rows } = await pool.query(
    `update user_emails
     set verified = true, otp = null, otp_expires_at = null, updated_at = now()
     where user_id = $1 and email = $2 and otp = $3 and otp_expires_at > now()
     returning id`,
    [userId, email, otp],
  );

  if (rows.length === 0) {
    throw new HttpError(422, "That code is invalid or has expired.");
  }
}

// Promotes a verified secondary email to primary, and updates BetterAuth's
// own user.email column so login/session lookups follow it.
export async function setPrimaryUserEmail(userId: string, emailId: string) {
  const client = await pool.connect();
  try {
    await client.query("begin");

    const { rows } = await client.query(
      `select email, verified from user_emails where id = $1 and user_id = $2`,
      [emailId, userId],
    );
    const target = rows[0];
    if (!target) throw new HttpError(404, "Email not found.");
    if (!target.verified) throw new HttpError(409, "Verify this email before making it primary.");

    await client.query(
      `update user_emails set is_primary = false, updated_at = now() where user_id = $1`,
      [userId],
    );
    await client.query(
      `update user_emails set is_primary = true, updated_at = now() where id = $1`,
      [emailId],
    );
    await client.query(
      `update users set email = $1, "updatedAt" = now() where id = $2`,
      [target.email, userId],
    );

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteUserEmail(userId: string, emailId: string) {
  const { rows } = await pool.query(
    `delete from user_emails where id = $1 and user_id = $2 and is_primary = false returning id`,
    [emailId, userId],
  );
  if (rows.length === 0) {
    throw new HttpError(409, "Can't delete the primary email, or email not found.");
  }
}
