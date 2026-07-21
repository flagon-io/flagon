import { apiError, apiJson } from "@/lib/api";
import { resolveOrgAccess } from "@/lib/api-auth.server";
import { PLANS, usageDisplay, type PlanId } from "@/lib/plans";
import { contractConsumption } from "@/lib/contracts.server";
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
 * On a CONTRACTED plan every *_cents field is null and the `contract` block
 * carries consumption against the negotiated envelope instead. The fee was
 * agreed up front from usage estimates, so a period's metered value is not
 * what the customer owes and must not be served as though it were. Cost is
 * still computed and frozen into the period snapshot; it is the RESPONSE that
 * withholds it. `usage_display` says which mode a client is in.
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
  const display = usageDisplay(plan as PlanId);

  // Contracted organizations get consumption against the negotiated envelope
  // instead of money. The envelope covers the whole TERM, not this period, so
  // seasonal traffic nets out (see src/lib/contracts.ts).
  const contracted =
    display === "contracted"
      ? await contractConsumption({ orgId: org.id })
      : null;

  /**
   * Cents are NULL, not zero, on a contracted plan.
   *
   * The metered value of a period is not what a contract customer owes - their
   * fee was negotiated up front from usage estimates - so serializing it as a
   * number invites a client to sum it, chart it, or reconcile it against an
   * invoice that will never carry it. Zero would be worse: it reads as a
   * confident statement that the period was free.
   */
  const cents = (value: number): number | null =>
    display === "contracted" ? null : value;

  return apiJson({
    period_start: isoDay(window.from),
    period_end: isoDay(window.to),
    period_label: formatPeriod(window),
    period_status: snapshot?.period.status ?? "open",
    stripe_invoice_id: snapshot?.period.stripeInvoiceId ?? null,
    plan,
    /**
     * Which fields carry meaning for this plan, so a client never has to infer
     * it from the plan id:
     *
     *   priced      every *_cents field is populated; `contract` is null
     *   capped      same, but nothing is ever invoiced
     *   contracted  every *_cents field is null; read `contract` instead
     */
    usage_display: display,
    included_credit_cents: cents(
      isFrozen && snapshot
        ? snapshot.period.includedCreditCents
        : context.includedCreditCents,
    ),
    credit_applied_cents: cents(totals.creditAppliedCents),
    credit_remaining_cents: cents(totals.creditRemainingCents),
    usage_cents: cents(totals.usageCents),
    overage_cents: cents(totals.overageCents),
    subscription_cents:
      display !== "contracted" &&
      PLANS[plan as keyof typeof PLANS]?.priceMonthly != null
        ? (PLANS[plan as keyof typeof PLANS].priceMonthly as number) * 100
        : null,
    contract: contracted
      ? {
          term_start: contracted.status.term.start,
          term_end: contracted.status.term.end,
          days_total: contracted.status.daysTotal,
          days_elapsed: contracted.status.daysElapsed,
          elapsed_percent: contracted.status.elapsedPercent,
          meters: contracted.status.envelopes.map((envelope) => ({
            meter: envelope.meter,
            label: envelope.label,
            unit: envelope.unit,
            contracted_quantity: envelope.contracted,
            used_quantity: envelope.used,
            remaining_quantity: envelope.remaining,
            used_percent: envelope.usedPercent,
            projected_quantity: envelope.projected,
            pace: envelope.pace,
          })),
        }
      : null,
    group_by: query.groupBy,
    granularity: query.granularity,
    meters: totals.lines.map((line) => ({
      meter: line.meterId,
      product: line.product,
      label: line.label,
      quantity: line.quantity,
      unit: line.unit,
      // The published rate is not a contract customer's rate, so quoting it
      // would let a client multiply out a total that is not their bill.
      unit_amount_cents: cents(line.rate.unitAmountCents),
      per: line.rate.per,
      included_quantity: line.rate.includedQuantity,
      cost_cents: cents(line.costCents),
    })),
    groups: rows.map((row) => ({
      key: row.key,
      label: row.label,
      quantity: row.quantity,
      cost_cents: cents(row.costCents),
    })),
    // Quantity rides alongside cost in every bucket, so a contracted client
    // gets a chartable series even with every cents field nulled out.
    series: (query.cumulative ? cumulate(view.buckets) : view.buckets).map(
      (bucket) => ({
        start: bucket.start,
        end: bucket.end,
        cost_cents: cents(bucket.totalCents),
        by_group: display === "contracted" ? {} : bucket.byGroup,
        quantity: bucket.totalQuantity,
        by_group_quantity: bucket.byGroupQuantity,
      }),
    ),
    projects: projectList.map((project) => ({
      id: project.id,
      name: project.name,
    })),
  });
}
