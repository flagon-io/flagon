import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { auth } from "@/lib/auth";
import { billingEnabled, getBillingSummary } from "@/lib/billing";
import { formatPeriod, isoDay } from "@/lib/billing-period";
import { contractConsumption, meteredUsage } from "@/lib/contracts.server";
import { PACE_COPY, formatTerm } from "@/lib/contracts";
import { coversUsage, discountedTotal } from "@/lib/discounts";
import {
  breakdownFromSnapshot,
  getPeriod,
  orgBillingContext,
  selectablePeriods,
  totalsFromSnapshot,
  windowForKey,
} from "@/lib/billing-periods.server";
import {
  PRODUCTS,
  activeMeters,
  activeProducts,
  billableQuantity,
  formatCents,
  formatMeterRate,
  formatQuantity,
  getMeter,
  type UsageLine,
} from "@/lib/meters";
import { PLANS, usageDisplay } from "@/lib/plans";
import { appPath } from "@/lib/urls";
import { parseUsageQuery } from "@/lib/usage-params";
import { ORG_LEVEL, cumulate, type UsageBucket } from "@/lib/usage-shared";
import { usageProjects, usageSummary, usageView } from "@/lib/usage.server";
import { resolveOrg } from "../resolve-org";
import { EVALUATION_METER, SYNC_METER, hardCap } from "@/lib/quota";
import { currentUsageCounter } from "@/lib/usage-events.server";
import { ConsumptionChart, OTHER_KEY, assignColors } from "./consumption-chart";
import { ChartControls, UsageFilterBar } from "./filter-bar";
import { QuotaMeter } from "./quota-meter";

export const metadata: Metadata = { title: "Usage" };

/**
 * Usage - `app.flagon.io/<org>/usage`.
 *
 * Answers what we used, what it cost, and what is still covered by the plan's
 * included credit, for ANY billing period - not just the open one. The window
 * follows the organization's own subscription cycle, because the organization
 * is the billing entity and its invoice does the same; a page that showed
 * calendar months while Stripe billed anniversaries would quote a different
 * number than the bill for the same month.
 *
 * Closed periods render from their frozen snapshot, so looking back at March
 * shows what March was billed rather than what March would cost today.
 *
 * The whole view is driven by the URL, and the REST endpoint parses the same
 * parameters, so this page and GET /v1/orgs/:slug/usage are one surface.
 */

/** Colors are a fixed set of eight; the tail folds rather than reusing hues. */
const MAX_SERIES = 8;

function foldSeries(
  rows: { key: string; label: string; costCents: number }[],
  buckets: UsageBucket[],
): {
  series: { key: string; label: string }[];
  buckets: UsageBucket[];
} {
  if (rows.length <= MAX_SERIES) {
    return { series: rows.map(({ key, label }) => ({ key, label })), buckets };
  }

  const kept = new Set(rows.slice(0, MAX_SERIES - 1).map((row) => row.key));
  const series = [
    ...rows.slice(0, MAX_SERIES - 1).map(({ key, label }) => ({ key, label })),
    { key: OTHER_KEY, label: `Other (${rows.length - MAX_SERIES + 1})` },
  ];
  return {
    series,
    buckets: buckets.map((bucket) => {
      const byGroup: Record<string, number> = {};
      let other = 0;
      for (const [key, cents] of Object.entries(bucket.byGroup)) {
        if (kept.has(key)) byGroup[key] = cents;
        else other += cents;
      }
      if (other > 0) byGroup[OTHER_KEY] = other;

      // Quantity folds by the same key set, so the two views of one bucket can
      // never disagree about which series got lumped into "Other".
      const byGroupQuantity: Record<string, number> = {};
      let otherQuantity = 0;
      for (const [key, quantity] of Object.entries(bucket.byGroupQuantity)) {
        if (kept.has(key)) byGroupQuantity[key] = quantity;
        else otherQuantity += quantity;
      }
      if (otherQuantity > 0) byGroupQuantity[OTHER_KEY] = otherQuantity;

      return { ...bucket, byGroup, byGroupQuantity };
    }),
  };
}

const STATUS_LABEL: Record<string, string> = {
  open: "In progress",
  closed: "Closed",
  invoiced: "Invoiced",
  void: "Void",
};

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ org: slug }, rawSearch] = await Promise.all([params, searchParams]);
  const [org, session] = await Promise.all([
    resolveOrg(slug),
    auth.api.getSession({ headers: await headers() }),
  ]);
  if (!org || !session) notFound();

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(rawSearch)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      search.append(key, item);
    }
  }
  const query = parseUsageQuery(search);

  const context = await orgBillingContext(org.id);
  const window =
    (query.period ? windowForKey(context.current, query.period) : null) ??
    context.current;

  const snapshot = await getPeriod({
    orgId: org.id,
    periodStart: isoDay(window.from),
  });
  const isFrozen = Boolean(snapshot && snapshot.period.status !== "open");

  const [view, projectList, periods, liveSummary] = await Promise.all([
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
    selectablePeriods({ orgId: org.id, current: context.current }),
    isFrozen
      ? Promise.resolve(null)
      : usageSummary({
          orgId: org.id,
          window,
          includedCreditCents: context.includedCreditCents,
          plan: context.plan,
        }),
  ]);

  // Frozen totals win over anything the current registry would compute.
  const totals =
    isFrozen && snapshot
      ? totalsFromSnapshot(snapshot.period, snapshot.lines)
      : liveSummary!;
  const planId = isFrozen && snapshot ? snapshot.period.plan : context.plan;
  const plan = PLANS[planId as keyof typeof PLANS] ?? PLANS.free;
  const includedCreditCents =
    isFrozen && snapshot
      ? snapshot.period.includedCreditCents
      : context.includedCreditCents;

  const rows =
    isFrozen && snapshot
      ? breakdownFromSnapshot(snapshot.lines, query.groupBy)
      : view.rows;

  const folded = foldSeries(
    rows,
    query.cumulative ? cumulate(view.buckets) : view.buckets,
  );
  const colors = assignColors(folded.series.map((entry) => entry.key));

  const billing = billingEnabled();

  // The hard cap, read from the ENFORCEMENT counter rather than the rollups:
  // rollups lag by a compaction cycle, and headroom that disagrees with the
  // number producing 429s would be worse than showing none. Only meaningful on
  // a capped plan viewing the period that is actually accruing.
  const isCurrentPeriod = isoDay(window.from) === isoDay(context.current.from);
  const cappedMeters =
    billing && isCurrentPeriod
      ? [EVALUATION_METER, SYNC_METER].filter(
          (meter) => hardCap(context.plan, meter) !== null,
        )
      : [];
  const quotas = await Promise.all(
    cappedMeters.map(async (meter) => ({
      meter,
      label: getMeter(meter)?.label ?? meter,
      unit: getMeter(meter)?.unit ?? "units",
      limit: hardCap(context.plan, meter) as number,
      used: (await currentUsageCounter({ orgId: org.id, meter })).used,
    })),
  );

  // How this plan's usage should be FRAMED: priced, capped, or contracted.
  // Read from the plan the period was billed on, not today's, so looking back
  // at a period from before an upgrade still renders the way it was billed.
  const display = usageDisplay(planId as Parameters<typeof usageDisplay>[0]);

  // Contracted orgs measure against the agreement, and the agreement covers
  // the whole TERM, not this period: consumption is drawn down cumulatively so
  // a busy summer and a quiet winter net out (see src/lib/contracts.ts).
  const contracted =
    display === "contracted"
      ? await contractConsumption({ orgId: org.id })
      : null;

  // The other half of a contracted org's usage: METERED meters, billed on top
  // of the base contract. A closed period reads its frozen metered lines; the
  // open one prices them live for the current cycle. This is the "clearly
  // separated overage outside your base bill" the model requires.
  const meteredLines: UsageLine[] =
    display === "contracted"
      ? isFrozen && snapshot
        ? totals.lines.filter((line) => line.billingMode === "metered")
        : await meteredUsage({
            orgId: org.id,
            window,
            contract: contracted?.contract ?? null,
          })
      : [];
  const meteredTotalCents = meteredLines.reduce(
    (sum, line) => sum + line.costCents,
    0,
  );

  // The discount in force, so "Total this period" cannot claim a customer on
  // three free months owes $20. Only meaningful where money is shown at all,
  // and the next-invoice preview is skipped: this page does not print it.
  const [customerRow] = billing
    ? await db
        .select({ customerId: organizations.stripeCustomerId })
        .from(organizations)
        .where(eq(organizations.id, org.id))
        .limit(1)
    : [];
  const discount =
    display === "priced" && customerRow?.customerId
      ? ((
          await getBillingSummary(customerRow.customerId, {
            includeNextInvoice: false,
          })
        )?.discount ?? null)
      : null;

  const creditPercent = includedCreditCents
    ? Math.min(
        100,
        Math.round((totals.creditAppliedCents / includedCreditCents) * 100),
      )
    : 0;
  // priceMonthly is null on contract pricing, and `?? 0` turned that into a
  // confident "$0.00 subscription" line on the bill of the one customer type
  // paying the most. Only a plan that actually HAS a price contributes one.
  const subscriptionCents =
    billing && plan.priceMonthly !== null ? plan.priceMonthly * 100 : 0;
  const { discountCents, totalCents } = discountedTotal(
    { subscriptionCents, usageCents: totals.overageCents },
    discount,
  );

  const usedMeters = new Map(totals.lines.map((line) => [line.meterId, line]));
  const meters = activeMeters().filter(
    (meter) => !query.products.length || query.products.includes(meter.product),
  );
  const isFiltered =
    query.products.length > 0 ||
    query.projects.length > 0 ||
    query.meters.length > 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-teal-400/80">
            {org.name}
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
            Usage
          </h1>
        </div>
        <div className="text-right text-sm text-zinc-500">
          <div>{plan.name} plan</div>
          <div className="mt-0.5">
            {formatPeriod(window)}
            <span className="ml-2 text-zinc-600">
              {STATUS_LABEL[snapshot?.period.status ?? "open"]}
            </span>
          </div>
        </div>
      </div>

      {/* Only on capped plans, and only for the CURRENT period: a ceiling has
          no meaning applied to a period that already closed. */}
      {quotas.length ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {quotas.map((quota) => (
            <QuotaMeter key={quota.meter} orgSlug={slug} {...quota} />
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        <UsageFilterBar
          periods={periods.map((entry) => ({
            value: entry.isCurrent ? "" : entry.key,
            label: entry.isCurrent
              ? "Current billing period"
              : formatPeriod(entry.window),
          }))}
          // Derived from the meter registry, not the label table: a product
          // with nothing to meter would be a filter that always shows zero.
          products={activeProducts().map((product) => ({
            value: product.id,
            label: product.label,
          }))}
          projects={[
            ...projectList.map((project) => ({
              value: project.id,
              label: project.name,
            })),
            { value: ORG_LEVEL, label: "Organization (no project)" },
          ]}
          meters={meters.map((meter) => ({
            value: meter.id,
            label: meter.label,
          }))}
          current={{
            period: query.period ?? "",
            products: query.products,
            projects: query.projects,
            meters: query.meters,
            groupBy: query.groupBy,
          }}
        />
      </div>

      {/* What this period means, framed three different ways.

          Contracted: consumption against the negotiated envelope, in units,
          with no money anywhere. The fee was agreed up front from usage
          estimates, so metered value is not a bill and rendering it as one
          quotes a charge that will never arrive.

          Hobby: a percentage. Its allowance is a CAP, not money: it is never
          invoiced, so "included credit" spent against "billed on top" describes
          a transaction that cannot occur, and putting a dollar figure on it
          invites comparison with Pro's credit, which is real.

          Pro: dollars, because dollars are the answer. */}
      {display === "contracted" ? (
        <>
          <ContractPanel contracted={contracted} />
          <MeteredPanel lines={meteredLines} totalCents={meteredTotalCents} />
        </>
      ) : (
        <div className="mt-6 border border-white/10 bg-white/2 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {display === "capped" ? (
              <>
                <div>
                  <div className="text-sm text-zinc-400">Allowance used</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-zinc-100">
                    {Math.round(creditPercent)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-zinc-400">
                    Billed this period
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight text-zinc-500">
                    Never
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="text-sm text-zinc-400">Included credit</div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-zinc-100">
                    {formatCents(totals.creditAppliedCents)}
                    <span className="text-lg font-normal text-zinc-500">
                      {" / "}
                      {formatCents(includedCreditCents)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-zinc-400">
                    {totals.overageCents > 0
                      ? "Billed on top"
                      : "Beyond included"}
                  </div>
                  <div
                    className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${
                      totals.overageCents > 0
                        ? "text-zinc-100"
                        : "text-zinc-500"
                    }`}
                  >
                    {formatCents(totals.overageCents)}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${creditPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Consumption over the period */}
      <div className="mt-6 border border-white/10 bg-white/2 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              Consumption breakdown
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {query.cumulative
                ? "Running total across the period"
                : display === "contracted"
                  ? "Consumption per bucket"
                  : "Cost per bucket, allowance drawn down in order"}
            </p>
          </div>
          <ChartControls
            granularity={query.granularity}
            cumulative={query.cumulative}
          />
        </div>
        <div className="mt-5">
          <ConsumptionChart
            buckets={folded.buckets}
            series={folded.series}
            colors={colors}
            cumulative={query.cumulative}
            unit={display === "contracted" ? "quantity" : "cents"}
          />
        </div>
      </div>

      {/* Grouped breakdown: the same numbers the chart is drawn from. */}
      <div className="mt-6 border border-white/10">
        <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <div className="min-w-0 flex-1">
            {query.groupBy === "project"
              ? "Project"
              : query.groupBy === "meter"
                ? "Meter"
                : "Product"}
          </div>
          <div className="w-40 text-right">Usage</div>
          {/* Dropped, not zeroed, on a contracted plan: a "Charge" column full
              of dollar figures nobody will be invoiced for is worse than no
              column, and $0.00 would be an outright lie. */}
          {display === "contracted" ? null : (
            <div className="w-24 text-right">Charge</div>
          )}
        </div>

        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-4 border-b border-white/5 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colors[row.key] ?? "#71717a" }}
                />
                <span className="truncate text-sm text-zinc-100">
                  {row.label}
                </span>
              </div>
              <div className="w-40 text-right text-sm tabular-nums text-zinc-300">
                {formatQuantity(row.quantity)}
              </div>
              {display === "contracted" ? null : (
                <div className="w-24 text-right text-sm font-medium tabular-nums text-zinc-100">
                  {formatCents(row.costCents)}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="border-b border-white/5 px-4 py-8 text-center text-sm text-zinc-500">
            No usage recorded{" "}
            {isFiltered ? "for this filter" : "in this period"}.
          </div>
        )}
      </div>

      {/* Per-meter detail: quantity against the allowance, and the rate. */}
      <div className="mt-6 border border-white/10">
        <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <div className="min-w-0 flex-1">Meter</div>
          <div className="w-40 text-right">Usage</div>
          {display === "contracted" ? null : (
            <div className="w-24 text-right">Charge</div>
          )}
        </div>
        {meters.map((meter) => {
          const line = usedMeters.get(meter.id);
          const quantity = line?.quantity ?? 0;
          // Frozen periods carry their own rate; the registry only describes
          // what the open period costs.
          const rate = line?.rate ?? meter;
          const billable = billableQuantity(rate, quantity);
          return (
            <div
              key={meter.id}
              className="flex items-center gap-4 border-b border-white/5 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-100">{meter.label}</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {PRODUCTS[meter.product].label}
                  {/* The published rate is not what a contracted customer
                      pays - their price was negotiated - so quoting it here
                      would invite them to multiply it out and arrive at a
                      number that is not their bill. */}
                  {display === "contracted"
                    ? ` · ${meter.unit}`
                    : ` · ${formatMeterRate(meter)}`}
                </div>
              </div>
              <div className="w-40 text-right text-sm tabular-nums text-zinc-300">
                {rate.includedQuantity ? (
                  <>
                    {formatQuantity(quantity)}
                    <span className="text-zinc-600">
                      {" / "}
                      {formatQuantity(rate.includedQuantity)}
                    </span>
                  </>
                ) : (
                  <>
                    {formatQuantity(quantity)}{" "}
                    <span className="text-zinc-600">{meter.unit}</span>
                  </>
                )}
                {billable > 0 && display !== "contracted" ? (
                  <div className="mt-0.5 text-[11px] text-amber-300/80">
                    {formatQuantity(billable)} billable
                  </div>
                ) : null}
              </div>
              {display === "contracted" ? null : (
                <div
                  className={`w-24 text-right text-sm tabular-nums ${
                    line?.costCents
                      ? "font-medium text-zinc-100"
                      : "text-zinc-600"
                  }`}
                >
                  {formatCents(line?.costCents ?? 0)}
                </div>
              )}
            </div>
          );
        })}

        {/* Where the money goes, in the order it's charged.

            Absent entirely on a contracted plan. Every line in it - a
            subscription price that is not their price, a credit that is not
            their credit, a total nobody will invoice - would be wrong, and
            zeroing them would be wrong more confidently. */}
        {display === "contracted" ? null : (
          <dl className="space-y-2 px-4 py-5 text-sm">
            {billing ? (
              <div className="flex justify-between">
                <dt className="text-zinc-400">Subscription ({plan.name})</dt>
                <dd className="tabular-nums text-zinc-200">
                  {formatCents(subscriptionCents)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-zinc-400">Usage subtotal</dt>
              <dd className="tabular-nums text-zinc-200">
                {formatCents(totals.usageCents)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-400">
                Included usage credit ({plan.name})
              </dt>
              <dd className="tabular-nums text-teal-300">
                -{formatCents(totals.creditAppliedCents)}
              </dd>
            </div>
            {/* A promotion is its OWN line, never folded into the credit above.
                They are different things - one is what the plan includes, the
                other is a discount that will expire - and a customer has to be
                able to see both to understand what happens when it ends. */}
            {discount && discountCents > 0 ? (
              <div className="flex justify-between">
                <dt className="text-zinc-400">
                  {discount.label}
                  {discount.durationLabel ? ` ${discount.durationLabel}` : ""}
                  {!coversUsage(discount) && totals.overageCents > 0 ? (
                    <span className="ml-1.5 text-xs text-zinc-500">
                      (subscription only)
                    </span>
                  ) : null}
                </dt>
                <dd className="tabular-nums text-teal-300">
                  -{formatCents(discountCents)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-white/10 pt-3 text-base">
              <dt className="font-medium text-zinc-100">
                {isFrozen
                  ? "Invoiced"
                  : billing
                    ? "Total this period"
                    : "Would be billed"}
              </dt>
              <dd className="font-semibold tabular-nums text-zinc-100">
                {formatCents(totalCents)}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {isFiltered ? (
        <p className="mt-4 text-xs text-zinc-500">
          The totals above cover the whole period. Filters narrow the chart and
          the breakdown, not what{" "}
          {display === "contracted"
            ? "counts toward the agreement"
            : "gets billed"}
          .
        </p>
      ) : null}

      <p className="mt-4 text-sm leading-6 text-zinc-500">
        {display === "contracted" ? (
          <>
            {/* No dollar figure anywhere for a contracted organization. The
                fee was agreed up front from usage estimates, so a metered
                total is not a bill and showing one as if it were invites
                someone to budget against a number we will never send. */}
            Your plan is priced by agreement, so nothing here is charged
            automatically. Usage is tracked against the volumes in your
            contract, measured across the whole term rather than month by month,
            and we will reach out to coordinate before anything exceeds what was
            agreed.
          </>
        ) : planId === "pro" ? (
          <>
            Pro includes {formatCents(includedCreditCents)} of usage each
            period: your subscription comes back as credit, and only what
            exceeds it is billed on top. The invoice carries these same lines.
          </>
        ) : billing ? (
          <>
            {/* No dollar figure for Hobby, deliberately. The number exists to
                SIZE the cap, not to be spent: Hobby is never invoiced, so
                quoting it describes a bill that cannot happen and invites
                comparison against Pro's credit, which is real money. */}
            Hobby includes enough usage for a side project and is never billed.
            Requests are refused at the cap rather than charged.{" "}
            <Link
              href={appPath(`/${slug}/billing`)}
              className="text-teal-400 transition hover:text-teal-300"
            >
              Upgrade to Pro
            </Link>{" "}
            for {formatCents(PLANS.pro.includedUsageCents)} of included usage
            each month.
          </>
        ) : (
          <>
            Billing isn&apos;t configured on this deployment, so nothing here is
            charged: these are the numbers a billed deployment would use.
          </>
        )}
      </p>
    </div>
  );
}

const PACE_TONE: Record<string, string> = {
  under: "border-white/10 text-zinc-400",
  on: "border-teal-500/40 text-teal-300",
  // Amber, not red: consuming ahead of estimate is a conversation to have, not
  // a failure. Nothing is refused and nothing is auto-charged.
  over: "border-amber-500/40 text-amber-300",
};

/**
 * Consumption against the negotiated agreement. The contracted plan's answer
 * to "what did this cost me?", which is: that is not the question your plan
 * asks. No money appears here at any point.
 *
 * The envelope is TERM-WIDE and drawn down cumulatively, so the headline pair
 * is consumption against elapsed term. That is what makes a seasonal customer
 * legible: 58% of the volume against 61% of the year is exactly on plan, and a
 * monthly frame would have called the same customer a problem in July.
 */
/**
 * The metered half of a contracted org's usage: what is billed ON TOP of the
 * base contract, kept in its own clearly-labelled panel so a customer is never
 * confused about which usage the negotiated fee covers and which is charged
 * automatically. Renders nothing when there is no metered usage - the common
 * case for an org whose whole footprint is covered.
 */
function MeteredPanel({
  lines,
  totalCents,
}: {
  lines: UsageLine[];
  totalCents: number;
}) {
  if (!lines.length) return null;
  return (
    <div className="mt-6 border border-amber-500/20 bg-amber-500/2 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            Billed outside your contract
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Usage on products your agreement doesn&apos;t cover, charged
            automatically this billing period.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">This period</div>
          <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-zinc-100">
            {formatCents(totalCents)}
          </div>
        </div>
      </div>

      <div className="mt-5 divide-y divide-white/5 border-t border-white/10">
        {lines.map((line) => (
          <div
            key={line.meterId}
            className="flex items-center gap-4 py-3 first:pt-4"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm text-zinc-100">{line.label}</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {formatCents(line.rate.unitAmountCents)} per{" "}
                {formatQuantity(line.rate.per)} {line.unit}
                {line.rate.includedQuantity ? (
                  <>
                    {" · "}
                    {formatQuantity(line.rate.includedQuantity)} included /
                    cycle
                  </>
                ) : null}
              </div>
            </div>
            <div className="w-32 text-right text-sm tabular-nums text-zinc-300">
              {formatQuantity(line.quantity)} {line.unit}
              {billableQuantity(line.rate, line.quantity) > 0 ? (
                <div className="mt-0.5 text-[11px] text-amber-300/80">
                  {formatQuantity(billableQuantity(line.rate, line.quantity))}{" "}
                  billable
                </div>
              ) : null}
            </div>
            <div className="w-24 text-right text-sm font-medium tabular-nums text-zinc-100">
              {formatCents(line.costCents)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContractPanel({
  contracted,
}: {
  contracted: Awaited<ReturnType<typeof contractConsumption>>;
}) {
  // No agreement on file is an ordinary state - paperwork not entered yet, or
  // an org between terms - so it says so plainly instead of erroring or, worse,
  // falling back to the priced view this plan must never see.
  if (!contracted) {
    return (
      <div className="mt-6 border border-white/10 bg-white/2 p-6">
        <div className="text-sm text-zinc-400">Contracted plan</div>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Usage is tracked against your agreement. The contracted volumes
          aren&apos;t recorded here yet, so this page shows consumption on its
          own for now.
        </p>
      </div>
    );
  }

  const { status } = contracted;
  const elapsed = Math.round(status.elapsedPercent);

  return (
    <div className="mt-6 border border-white/10 bg-white/2 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-sm text-zinc-400">Contract usage</div>
        <div className="text-xs text-zinc-500">
          {formatTerm(status.term)} · {elapsed}% of term elapsed
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {status.envelopes.map((envelope) => {
          const used = Math.round(envelope.usedPercent ?? 0);
          return (
            <div key={envelope.meter}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="text-sm text-zinc-300">{envelope.label}</div>
                <div className="text-sm tabular-nums text-zinc-100">
                  {formatQuantity(envelope.used)}
                  {envelope.contracted !== null ? (
                    <span className="text-zinc-500">
                      {" / "}
                      {formatQuantity(envelope.contracted)} {envelope.unit}
                    </span>
                  ) : (
                    <span className="text-zinc-500"> {envelope.unit}</span>
                  )}
                </div>
              </div>

              {envelope.contracted !== null ? (
                <>
                  <div className="relative mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full transition-all ${
                        used > 100 ? "bg-amber-400" : "bg-teal-500"
                      }`}
                      style={{ width: `${Math.min(used, 100)}%` }}
                    />
                    {/* Where the term is. A bar read without it says nothing:
                        70% consumed is reassuring in November and alarming in
                        February, and only the marker tells them apart. */}
                    <div
                      aria-hidden
                      className="absolute inset-y-0 w-px bg-white/50"
                      style={{ left: `${Math.min(elapsed, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span>{used}% of contract</span>
                    {envelope.pace ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 ${
                          PACE_TONE[envelope.pace] ?? PACE_TONE.on
                        }`}
                      >
                        {PACE_COPY[envelope.pace]}
                      </span>
                    ) : null}
                    {envelope.projected !== null ? (
                      // Explicitly hedged. A linear projection is the wrong
                      // lens on seasonal traffic, which is the traffic this
                      // whole model exists to absorb, so it never leads.
                      <span>
                        {formatQuantity(envelope.projected)} by term end at the
                        current pace
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="mt-1.5 text-xs text-zinc-500">
                  Not covered by a contracted volume. Recorded here so it can be
                  reviewed at renewal.
                </p>
              )}
            </div>
          );
        })}

        {status.envelopes.length ? null : (
          <p className="text-sm text-zinc-500">
            No usage recorded against this agreement yet.
          </p>
        )}
      </div>
    </div>
  );
}
