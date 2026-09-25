// Account lifecycle. Deletion is SOFT: we stamp deletedAt and revoke sessions, so
// an account can be restored (accidental/malicious deletion) by clearing
// deletedAt. A future job can hard-purge long-deleted accounts.
import { pool } from "@/lib/db";

import { internalToken } from "@/lib/internal-token";

const API_URL = process.env.FLAGON_API_URL ?? "http://localhost:8080";

/** Mirror the soft-delete state into the API so the public profile hides deleted
 *  accounts. Best-effort + time-boxed: never block account deletion over it. */
async function mirrorDeletedState(userId: string, email: string, deleted: boolean) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    await fetch(`${API_URL}/me/deleted`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${internalToken()}`,
        "X-Flagon-User-Id": userId,
        "X-Flagon-User-Email": email,
      },
      body: JSON.stringify({ deleted }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("mirrorDeletedState failed", err);
  } finally {
    clearTimeout(timeout);
  }
}

async function userEmail(userId: string): Promise<string> {
  const { rows } = await pool.query(`select email from users where id = $1`, [userId]);
  return rows[0]?.email ?? "";
}

/** Soft-delete: stamp deletedAt and revoke all of the user's sessions. */
export async function softDeleteUser(userId: string) {
  const email = await userEmail(userId);
  await pool.query(`update users set "deletedAt" = now(), "updatedAt" = now() where id = $1`, [
    userId,
  ]);
  // Kill every active session so the account is immediately locked out.
  await pool.query(`delete from sessions where "userId" = $1`, [userId]);
  await mirrorDeletedState(userId, email, true);
}

/** Restore a soft-deleted account (admin/support action; clears deletedAt). */
export async function restoreUser(userId: string) {
  const email = await userEmail(userId);
  await pool.query(`update users set "deletedAt" = null, "updatedAt" = now() where id = $1`, [
    userId,
  ]);
  await mirrorDeletedState(userId, email, false);
}

/** True when the account is soft-deleted (used to block re-login). */
export async function isUserSoftDeleted(userId: string): Promise<boolean> {
  const { rows } = await pool.query(`select "deletedAt" from users where id = $1`, [userId]);
  return Boolean(rows[0]?.deletedAt);
}
