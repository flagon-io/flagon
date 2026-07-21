import { apiJson } from "@/lib/api";
import { resolveOrgAccess } from "@/lib/api-auth.server";
import { orgBillingContext } from "@/lib/billing-periods.server";
import {
  EVALUATION_METER,
  SYNC_METER,
  hardCap,
  pricingAllowance,
} from "@/lib/quota";
import { currentUsageCounter } from "@/lib/usage-events.server";

/**
 * GET /api/v1/orgs/:slug/usage/evaluations -> the live evaluation counter and
 * the plan's hard cap.
 *
 * Distinct from GET /usage, and deliberately so. That endpoint answers "what
 * will this cost", from the compacted rollups, and lags by a compaction cycle.
 * This one answers "am I about to be cut off", from the counter that
 * enforcement actually reads, with no lag at all. A client watching its
 * headroom has to see the same number the 429 is derived from.
 *
 * Uncapped plans report `limit` and `remaining` as null rather than as a large
 * number: there is no ceiling to count down from, and inventing one would
 * teach clients to alarm on a threshold that does not exist.
 *
 * Documented in src/lib/openapi.ts; keep the two in sync.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await resolveOrgAccess(request, slug, "usage:read");
  if (!access.ok) return access.error;
  const { org } = access.access;

  const context = await orgBillingContext(org.id);
  const [evaluations, syncs] = await Promise.all([
    currentUsageCounter({ orgId: org.id, meter: EVALUATION_METER }),
    currentUsageCounter({ orgId: org.id, meter: SYNC_METER }),
  ]);

  const counter = (meter: string, used: number) => {
    const limit = hardCap(context.plan, meter);
    return {
      meter,
      used,
      limit,
      remaining: limit === null ? null : Math.max(limit - used, 0),
      // The one field a client should branch on. The rest is arithmetic.
      hard_capped: limit !== null,
      // What this plan gets before it is CHARGED, which is a different
      // question from what it is allowed to consume: on Pro the sync
      // allowance is billed past, not refused.
      included: pricingAllowance(context.plan, meter),
    };
  };

  return apiJson({
    // The org's own billing window, not the calendar month: the cap counts
    // the same period the invoice does (drizzle/0027).
    period_start: evaluations.periodStart,
    plan: context.plan,
    counters: [
      counter(EVALUATION_METER, evaluations.used),
      counter(SYNC_METER, syncs.used),
    ],
  });
}
