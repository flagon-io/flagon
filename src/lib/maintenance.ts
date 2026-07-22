import { lt } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { sessions, verifications } from "@/db/auth-schema";
import { sweepFlagUsage } from "@/lib/flag-usage.server";

/**
 * Periodic database hygiene, invoked by the daily cron
 * (/api/cron/cleanup). Complements the opportunistic purges:
 *
 * - sessions: BetterAuth deletes an expired session only when its token is
 *   next presented; sessions of users who never return linger.
 * - verifications: purged on every token creation, but a quiet instance
 *   never creates tokens.
 * - rate_limits: one row per client key; counters whose window has long
 *   passed are dead weight.
 * - flag usage: fold recent hourly exposure rollups into the daily table, then
 *   trim hourly rollups and sampled exposures past retention.
 *
 * Everything deleted here is unusable by definition; running it is always
 * safe.
 */
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function cleanupExpired(): Promise<{
  sessions: number;
  verifications: number;
  rate_limits: number;
  flag_usage: {
    organizations: number;
    folded: number;
    trimmedHourly: number;
    trimmedSamples: number;
  };
}> {
  const now = new Date();
  const [expiredSessions, expiredVerifications, staleRateLimits, flagUsage] =
    await Promise.all([
      db.delete(sessions).where(lt(sessions.expiresAt, now)).returning(),
      db
        .delete(verifications)
        .where(lt(verifications.expiresAt, now))
        .returning(),
      db
        .delete(rateLimits)
        .where(lt(rateLimits.lastRequest, Date.now() - RATE_LIMIT_RETENTION_MS))
        .returning(),
      sweepFlagUsage(),
    ]);

  return {
    sessions: expiredSessions.length,
    verifications: expiredVerifications.length,
    rate_limits: staleRateLimits.length,
    flag_usage: flagUsage,
  };
}
