import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { usageEvents, usageMeterReports } from "../db/schema.js";
import { withOrg } from "../db/tenant.js";
import { getStripe } from "../lib/stripe.js";
import { isMeteredReportable } from "../lib/entitlement.js";
import type { BillingOrg } from "../lib/billing.js";
import { sourceMeter } from "./meters.js";

/**
 * Report an org's metered usage to Stripe, exactly-once.
 *
 * The billing truth is the immutable usage_events log. Reporting CLAIMS the
 * unreported-and-compacted receipts (stamping reported_at, exactly like compaction
 * stamps compacted_at), stages a `pending` usage_meter_reports row per billed source
 * whose id IS the Stripe meter-event identifier, then sends. Because the claim commits
 * before the send, a crash between them leaves a pending row the next sweep re-sends
 * with the SAME identifier — so a crash, retry, or webhook redelivery never
 * double-bills (our reported_at + Stripe's 24h identifier dedup, both sides).
 *
 * Reported with Stripe's default (now) timestamp — receipts are minutes old under the
 * cron — so Stripe buckets usage into the CURRENT billing period. A receipt that was
 * stuck (sweep down) therefore bills in the current period, not its original month;
 * the report ledger's period_key records the month we reported in, matching that.
 */

/** The 'YYYY-MM' we report into (now) — aligns with the meter event's now() timestamp. */
function currentPeriodKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Claim this org's unreported+compacted receipts and stage one pending report row per
 * billed source. One atomic transaction: after it commits, the claimed receipts can
 * never be re-claimed, and each pending row owns a fixed Stripe identifier.
 */
export async function claimAndStage(org: BillingOrg, period: string): Promise<void> {
  await withOrg(org.id, async (tx) => {
    const compacted = sql`${usageEvents.compactedAt} is not null`;
    const sources = await tx
      .selectDistinct({ source: usageEvents.source })
      .from(usageEvents)
      .where(and(isNull(usageEvents.reportedAt), compacted));

    for (const { source } of sources) {
      const meter = sourceMeter(source);
      const reportRowId = randomUUID();
      // Claim the source's unreported receipts. Unbilled sources are still stamped
      // reported (report_id null) so they clear the index and are never charged.
      const claimed = await tx
        .update(usageEvents)
        .set({ reportedAt: sql`now()`, reportId: meter ? reportRowId : null })
        .where(
          and(
            eq(usageEvents.source, source),
            isNull(usageEvents.reportedAt),
            compacted,
          ),
        )
        .returning({ quantity: usageEvents.quantity });

      if (!meter) continue;
      const quantity = claimed.reduce((sum, r) => sum + r.quantity, 0);
      if (quantity <= 0) continue;

      await tx.insert(usageMeterReports).values({
        id: reportRowId,
        organizationId: org.id,
        source,
        eventName: meter.eventName,
        stripeCustomerId: org.stripeCustomerId!,
        quantity,
        status: "pending",
        periodKey: period,
      });
    }
  });
}

/**
 * Send every pending report row for the org to the Stripe meter, marking each 'sent'
 * on success. Per-row isolation: a send failure leaves that row pending for the next
 * sweep (retried with the same identifier — Stripe dedups within 24h) without blocking
 * the others. Picks up rows left pending by a prior crashed run.
 */
async function sendPending(org: BillingOrg): Promise<number> {
  const pending = await withOrg(org.id, (tx) =>
    tx.select().from(usageMeterReports).where(eq(usageMeterReports.status, "pending")),
  );
  if (pending.length === 0) return 0;

  const stripe = getStripe();
  let sentQty = 0;
  for (const row of pending) {
    // Observability: a row should send within one 5-min sweep. One aging past an hour
    // means repeated send failures or a cron gap — the ONLY way the 24h identifier
    // dedup window could lapse and risk a double-count on the eventual re-send. Loud
    // so a cron outage is visible; the reconcile-meter tie-out is the backstop.
    const ageMinutes = (Date.now() - new Date(row.createdAt).getTime()) / 60000;
    if (ageMinutes > 60) {
      console.warn(
        `[report] report ${row.id} has been pending ${Math.round(ageMinutes)}min — ` +
          `investigate (cron gap / repeated Stripe failure).`,
      );
    }
    try {
      await stripe.billing.meterEvents.create({
        event_name: row.eventName,
        identifier: row.id, // the dedup key — stable across retries
        payload: {
          stripe_customer_id: row.stripeCustomerId,
          value: String(row.quantity),
        },
        // timestamp defaults to now(); receipts are minutes old under the 5-min cron.
      });
      await withOrg(org.id, (tx) =>
        tx
          .update(usageMeterReports)
          .set({ status: "sent", sentAt: sql`now()` })
          .where(eq(usageMeterReports.id, row.id)),
      );
      sentQty += row.quantity;
    } catch (err) {
      // Leave the row pending; the next sweep retries with the same identifier.
      console.error(`[report] meter event failed for report ${row.id}:`, err);
    }
  }
  return sentQty;
}

/**
 * Report one org's metered usage. Gated (invariant #2): only an active, entitled,
 * customer-linked Pro org is ever reported — a canceled/locked/Hobby/comped-null org
 * claims nothing. Safe to run on any schedule; the sweep calls it, and
 * handleSubscriptionDeleted calls it as a final flush BEFORE flipping status.
 */
export async function reportOrgUsage(org: BillingOrg): Promise<{ sent: number }> {
  if (!isMeteredReportable(org)) return { sent: 0 };
  await claimAndStage(org, currentPeriodKey());
  const sent = await sendPending(org);
  return { sent };
}
