import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { organizations } from "../db/auth-tables.js";
import { reportOrgUsage } from "./report.js";

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

export async function sweepUsageReports(): Promise<{ orgs: number; sent: number }> {
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
      ),
    );

  let sent = 0;
  for (const org of orgs) {
    try {
      const result = await reportOrgUsage(org);
      sent += result.sent;
    } catch (err) {
      console.error(`[report-sweep] org ${org.slug} failed:`, err);
    }
  }
  return { orgs: orgs.length, sent };
}
