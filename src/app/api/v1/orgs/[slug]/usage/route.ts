import { apiError, apiJson } from "@/lib/api";
import { resolveOrgAccess } from "@/lib/api-auth.server";
import { PLANS } from "@/lib/plans";
import { formatPeriod, isoDay } from "@/lib/billing-period";
import {
  breakdownFromSnapshot,
  getPeriod,
  orgBillingContext,
  totalsFromSnapshot,
  windowForKey,
} from "@/lib/billing-periods.server";
import { parseUsageQuery } from "@/lib/usage-params";
import { cumulate } from "@/lib/usage-shared";
import { usageProjects, usageSummary, usageView } from "@/lib/usage.server";

/**
 * GET /api/v1/orgs/:slug/usage -> what the organization used, priced per
 * meter, with the plan's included credit applied.
 *
 * The same data the console renders, sliced the same way: the console's URL
 * IS this query string. Query parameters:
 *
 *   period       Period start (YYYY-MM-DD). Defaults to the current cycle.
 *   product      Repeatable or comma-separated product filter.
 *   project      Repeatable project id filter; `__org__` for unattributed.
 *   meter        Repeatable meter id filter.
 *   group_by     product (default) | project | meter
 *   granularity  daily (default) | weekly | monthly
 *   cumulative   1 to return running totals per bucket
 *
 * A period that has been CLOSED is served from its frozen snapshot, so a
 * historical response reports the rates that were actually billed rather than
 * whatever the meter costs today.
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

  const query = parseUsageQuery(new URL(request.url).searchParams);
  const context = await orgBillingContext(org.id);

  const window = query.period
    ? windowForKey(context.current, query.period)
    : context.current;
  if (!window) {
    return apiError(
      400,
      "invalid_period",
      "No billing period starts on that date.",
    );
  }

  const snapshot = await getPeriod({
    orgId: org.id,
    periodStart: isoDay(window.from),
  });
  const isFrozen = Boolean(snapshot && snapshot.period.status !== "open");

  const [view, projectList] = await Promise.all([
    usageView({
      orgId: org.id,
      window,
      filter: {
        products: query.products,
        projects: query.projects,
        meters: query.meters,
      },
      groupBy: query.groupBy,
      granularity: query.granularity,
      plan: context.plan,
    }),
    usageProjects({ orgId: org.id, window }),
  ]);

  // Totals come from the frozen snapshot when there is one: what was billed
  // wins over what the current registry would charge.
  const totals =
    isFrozen && snapshot
      ? totalsFromSnapshot(snapshot.period, snapshot.lines)
      : await usageSummary({
          orgId: org.id,
          window,
          includedCreditCents: context.includedCreditCents,
          plan: context.plan,
        });

  const plan = isFrozen && snapshot ? snapshot.period.plan : context.plan;
  const rows =
    isFrozen && snapshot
      ? breakdownFromSnapshot(snapshot.lines, query.groupBy)
      : view.rows;

  return apiJson({
    period_start: isoDay(window.from),
    period_end: isoDay(window.to),
    period_label: formatPeriod(window),
    period_status: snapshot?.period.status ?? "open",
    stripe_invoice_id: snapshot?.period.stripeInvoiceId ?? null,
    plan,
    included_credit_cents:
      isFrozen && snapshot
        ? snapshot.period.includedCreditCents
        : context.includedCreditCents,
    credit_applied_cents: totals.creditAppliedCents,
    credit_remaining_cents: totals.creditRemainingCents,
    usage_cents: totals.usageCents,
    overage_cents: totals.overageCents,
    subscription_cents:
      PLANS[plan as keyof typeof PLANS]?.priceMonthly != null
        ? (PLANS[plan as keyof typeof PLANS].priceMonthly as number) * 100
        : null,
    group_by: query.groupBy,
    granularity: query.granularity,
    meters: totals.lines.map((line) => ({
      meter: line.meterId,
      product: line.product,
      label: line.label,
      quantity: line.quantity,
      unit: line.unit,
      unit_amount_cents: line.rate.unitAmountCents,
      per: line.rate.per,
      included_quantity: line.rate.includedQuantity,
      cost_cents: line.costCents,
    })),
    groups: rows.map((row) => ({
      key: row.key,
      label: row.label,
      quantity: row.quantity,
      cost_cents: row.costCents,
    })),
    series: (query.cumulative ? cumulate(view.buckets) : view.buckets).map(
      (bucket) => ({
        start: bucket.start,
        end: bucket.end,
        cost_cents: bucket.totalCents,
        by_group: bucket.byGroup,
      }),
    ),
    projects: projectList.map((project) => ({
      id: project.id,
      name: project.name,
    })),
  });
}
