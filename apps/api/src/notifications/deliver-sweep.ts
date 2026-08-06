import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { withOrg } from "../db/tenant.js";
import { alertChannels, notificationDeliveries } from "../db/schema.js";
import { deliver } from "./providers.js";
import { captureError } from "../lib/monitoring.js";

/**
 * Notification drain sweep — the delivery half of the outbound spine. Picks up due
 * `notification_deliveries` (pending, or failed-and-past-backoff, under the attempt
 * cap) and delivers each through its channel's provider, recording the outcome and
 * updating the channel's health. Runs on the cron (routes/internal/cron.route.ts).
 *
 * - The external POST is done OUTSIDE any transaction: a slow/hanging destination must
 *   never hold a DB connection open. Each delivery is a short claim tx, the network
 *   call, then a short record tx (mirrors the escalation sweep's notify-after pattern).
 * - The claim is an atomic conditional bump of `attempts`, so two overlapping sweeps
 *   can't both send the same row.
 * - Failures back off exponentially (1m, 2m, 4m, …) until `max_attempts`, then land in
 *   `dead` and surface as the channel's `failing` health — never retried into the ground.
 * Per-org isolation via the withOrg loop; a failed org is captured and skipped.
 */

const BACKOFF_BASE_MS = 60_000;
const MAX_PER_ORG = 200;

export async function sweepDeliveries(): Promise<{ orgs: number; delivered: number; failed: number }> {
  const orgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(isNull(organizations.deletedAt));
  let delivered = 0;
  let failed = 0;

  for (const org of orgs) {
    try {
      const now = new Date();
      const due = await withOrg(org.id, async (tx) =>
        tx
          .select()
          .from(notificationDeliveries)
          .where(
            and(
              or(eq(notificationDeliveries.status, "pending"), eq(notificationDeliveries.status, "failed")),
              lte(notificationDeliveries.nextAttemptAt, now),
              sql`${notificationDeliveries.attempts} < ${notificationDeliveries.maxAttempts}`,
            ),
          )
          .orderBy(notificationDeliveries.nextAttemptAt)
          .limit(MAX_PER_ORG),
      );

      for (const d of due) {
        // 1) Atomic claim + load channel (short tx). If another sweep already bumped
        // attempts, we lose the race and skip.
        const claim = await withOrg(org.id, async (tx) => {
          const [claimed] = await tx
            .update(notificationDeliveries)
            .set({ attempts: d.attempts + 1, updatedAt: new Date() })
            .where(and(eq(notificationDeliveries.id, d.id), eq(notificationDeliveries.attempts, d.attempts)))
            .returning({ id: notificationDeliveries.id });
          if (!claimed) return null;
          const [ch] = await tx.select().from(alertChannels).where(eq(alertChannels.id, d.channelId)).limit(1);
          return { channel: ch ?? null };
        });
        if (!claim) continue;

        const attempts = d.attempts + 1;
        if (!claim.channel) {
          await withOrg(org.id, (tx) =>
            tx
              .update(notificationDeliveries)
              .set({ status: "dead", error: "channel deleted", updatedAt: new Date() })
              .where(eq(notificationDeliveries.id, d.id)),
          );
          failed += 1;
          continue;
        }

        // 2) Deliver with NO transaction held.
        const res = await deliver(claim.channel, d.payload);

        // 3) Record the outcome + channel health (short tx).
        const at = new Date();
        await withOrg(org.id, async (tx) => {
          if (res.ok) {
            await tx
              .update(notificationDeliveries)
              .set({ status: "sent", statusCode: res.statusCode ?? null, error: null, deliveredAt: at, updatedAt: at })
              .where(eq(notificationDeliveries.id, d.id));
            await tx
              .update(alertChannels)
              .set({ health: "ok", lastError: null, lastDeliveredAt: at, updatedAt: at })
              .where(eq(alertChannels.id, claim.channel!.id));
          } else {
            const dead = attempts >= d.maxAttempts;
            const backoff = new Date(at.getTime() + BACKOFF_BASE_MS * 2 ** Math.min(attempts, 6));
            await tx
              .update(notificationDeliveries)
              .set({
                status: dead ? "dead" : "failed",
                statusCode: res.statusCode ?? null,
                error: (res.error ?? "").slice(0, 1000),
                nextAttemptAt: backoff,
                updatedAt: at,
              })
              .where(eq(notificationDeliveries.id, d.id));
            await tx
              .update(alertChannels)
              .set({ health: "failing", lastError: (res.error ?? "").slice(0, 500), updatedAt: at })
              .where(eq(alertChannels.id, claim.channel!.id));
          }
        });
        if (res.ok) delivered += 1;
        else failed += 1;
      }
    } catch (err) {
      captureError("[notifications] delivery sweep failed", err, { org: org.id });
    }
  }
  return { orgs: orgs.length, delivered, failed };
}
