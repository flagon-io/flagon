import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { reportOrgUsage } from "./report.js";
import { reportUptimeUsage } from "../lib/billing.js";
import { compactUsageEvents } from "./events.js";
import { captureError } from "../lib/monitoring.js";

/**
 * The metered-billing reporting sweep — the ONLY place usage is reported to Stripe.
 * Run on a schedule (Vercel Cron via routes/internal/cron.route.ts), never on the
 * ingest hot path, so a Stripe outage can never break exposure ingest.
 *
 * Enumerates metered-eligible orgs from `organizations` (an auth table, no RLS, so the
 * restricted app role can read it across tenants — see migration 0020), then reports
 * each inside withOrg(). Per-org isolation: one org's Stripe failure leaves its
 * receipts unreported for the next sweep and never blocks the others.
 */

// Mirrors entitlement.ts ENTITLING_STATUSES; a plain array for the SQL IN filter.
const ENTITLING_STATUSES = ["active", "trialing", "past_due"];

export async function sweepUsageReports(): Promise<{
  orgs: number;
  sent: number;
  failed: number;
}> {
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      plan: organizations.plan,
      stripeCustomerId: organizations.stripeCustomerId,
      stripeSubscriptionId: organizations.stripeSubscriptionId,
      subscriptionStatus: organizations.subscriptionStatus,
    })
    .from(organizations)
    .where(
      and(
        eq(organizations.plan, "pro"),
        inArray(organizations.subscriptionStatus, ENTITLING_STATUSES),
        isNotNull(organizations.stripeCustomerId),
        // Never report usage for a soft-deleted org (defense-in-depth: the delete
        // flow already sets status=canceled, but don't rely on that alone).
        isNull(organizations.deletedAt),
      ),
    );

  let sent = 0;
  let failed = 0;
  for (const org of orgs) {
    try {
      // Backstop: compact any receipts whose inline (waitUntil) compaction was dropped
      // — on Vercel that promise is fire-and-forget and a function timeout/crash after
      // the 202 loses it. reportOrgUsage only claims COMPACTED receipts, so without
      // this a straggler stays compacted_at=NULL forever and its Pro usage is never
      // billed. Compaction is idempotent (UPDATE ... WHERE compacted_at IS NULL) and a
      // cheap no-op when there's nothing pending.
      await compactUsageEvents(org.id);
      const result = await reportOrgUsage(org);
      sent += result.sent;
      // Report the current active uptime-monitor count as a gauge (Stripe `last`
      // aggregation bills the last value). Best-effort inside — never fails the org.
      await reportUptimeUsage(org);
    } catch (err) {
      // Swallow per-org so one org's Stripe/DB failure leaves its receipts for the
      // next sweep without blocking the others — but alert, because a persistent
      // failure here silently drops that org's bill.
      failed += 1;
      captureError(`[report-sweep] org ${org.slug} failed`, err, { org: org.slug });
    }
  }
  return { orgs: orgs.length, sent, failed };
}
