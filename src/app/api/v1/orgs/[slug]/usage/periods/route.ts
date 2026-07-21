import { apiJson } from "@/lib/api";
import { resolveOrgAccess } from "@/lib/api-auth.server";
import { formatPeriod, isoDay } from "@/lib/billing-period";
import {
  listPeriods,
  orgBillingContext,
  selectablePeriods,
} from "@/lib/billing-periods.server";

/**
 * GET /api/v1/orgs/:slug/usage/periods -> the billing periods this
 * organization can be asked about, newest first.
 *
 * Each entry's `period_start` is the `period=` value for
 * GET /v1/orgs/:slug/usage, which is how you page back through history. The
 * open period is included and carries live numbers; closed ones carry the
 * totals that were frozen when they were billed.
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
  const [windows, closed] = await Promise.all([
    selectablePeriods({ orgId: org.id, current: context.current }),
    listPeriods({ orgId: org.id, limit: 36 }),
  ]);
  const byStart = new Map(closed.map((period) => [period.periodStart, period]));

  return apiJson(
    windows.map((entry) => {
      const period = byStart.get(entry.key);
      return {
        period_start: entry.key,
        period_end: isoDay(entry.window.to),
        label: formatPeriod(entry.window),
        status: period?.status ?? "open",
        is_current: entry.isCurrent,
        plan: period?.plan ?? context.plan,
        // Null until the period is closed: an open period's totals move, and
        // quoting a moving number in a list is how support tickets start.
        usage_cents: period?.usageCents ?? null,
        credit_applied_cents: period?.creditAppliedCents ?? null,
        overage_cents: period?.overageCents ?? null,
        stripe_invoice_id: period?.stripeInvoiceId ?? null,
      };
    }),
  );
}
