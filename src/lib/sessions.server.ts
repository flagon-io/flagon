import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client";
import { sessions } from "../db/auth-schema";

/**
 * Signing in supersedes that device's previous session.
 *
 * A browser only ever holds one session cookie, so re-authenticating leaves
 * the old token orphaned: dead weight on the sessions page and a live
 * credential nobody is holding. Dropping it keeps Sessions a list of
 * DEVICES (one row each) instead of a log of every sign-in.
 *
 * Conservative on purpose: a session is only superseded when it matches
 * both the user agent and the IP of the new one, and only when both are
 * known. Anything else (another browser, another network) is a genuinely
 * different device and stays listed.
 */
export async function supersedeDeviceSessions(session: {
  userId: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const { userAgent, ipAddress } = session;
  if (!userAgent || !ipAddress) return;

  await db
    .delete(sessions)
    .where(
      and(
        eq(sessions.userId, session.userId),
        ne(sessions.token, session.token),
        eq(sessions.userAgent, userAgent),
        eq(sessions.ipAddress, ipAddress),
      ),
    );
}
