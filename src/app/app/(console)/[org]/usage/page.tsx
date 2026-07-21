import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing";
import { formatPeriod, isoDay } from "@/lib/billing-period";
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
} from "@/lib/meters";
import { PLANS } from "@/lib/plans";
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
      return { ...bucket, byGroup };
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
  const cappedMeters = billing && isCurrentPeriod
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

  const creditPercent = includedCreditCents
    ? Math.min(
        100,
        Math.round((totals.creditAppliedCents / includedCreditCents) * 100),
      )
    : 0;
  const subscriptionCents = billing ? (plan.priceMonthly ?? 0) * 100 : 0;
  const totalCents = subscriptionCents + totals.overageCents;

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

      {/* Included credit.
          Hobby gets a different frame, not a different number. Its allowance
          is a CAP, not money: it is never invoiced, so "included credit" spent
          against "billed on top" describes a transaction that cannot occur,
          and putting a dollar figure on it invites the reader to compare it
          with Pro's credit, which is real. A percentage says the only thing
          that is actually true and actionable: how much is left. */}
      <div className="mt-6 border border-white/10 bg-white/2 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {planId === "free" ? (
            <>
              <div>
                <div className="text-sm text-zinc-400">Allowance used</div>
                <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-zinc-100">
                  {Math.round(creditPercent)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-zinc-400">Billed this period</div>
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
                  {totals.overageCents > 0 ? "Billed on top" : "Beyond included"}
                </div>
                <div
                  className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${
                    totals.overageCents > 0 ? "text-zinc-100" : "text-zinc-500"
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
          <div className="w-24 text-right">Charge</div>
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
                <span className="truncate text-sm text-zinc-100">{row.label}</span>
              </div>
              <div className="w-40 text-right text-sm tabular-nums text-zinc-300">
                {formatQuantity(row.quantity)}
              </div>
              <div className="w-24 text-right text-sm font-medium tabular-nums text-zinc-100">
                {formatCents(row.costCents)}
              </div>
            </div>
          ))
        ) : (
          <div className="border-b border-white/5 px-4 py-8 text-center text-sm text-zinc-500">
            No usage recorded {isFiltered ? "for this filter" : "in this period"}.
          </div>
        )}
      </div>

      {/* Per-meter detail: quantity against the allowance, and the rate. */}
      <div className="mt-6 border border-white/10">
        <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <div className="min-w-0 flex-1">Meter</div>
          <div className="w-40 text-right">Usage</div>
          <div className="w-24 text-right">Charge</div>
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
                  {PRODUCTS[meter.product].label} · {formatMeterRate(meter)}
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
                {billable > 0 ? (
                  <div className="mt-0.5 text-[11px] text-amber-300/80">
                    {formatQuantity(billable)} billable
                  </div>
                ) : null}
              </div>
              <div
                className={`w-24 text-right text-sm tabular-nums ${
                  line?.costCents
                    ? "font-medium text-zinc-100"
                    : "text-zinc-600"
                }`}
              >
                {formatCents(line?.costCents ?? 0)}
              </div>
            </div>
          );
        })}

        {/* Where the money goes, in the order it's charged. */}
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
            <dt className="text-zinc-400">Included usage credit ({plan.name})</dt>
            <dd className="tabular-nums text-teal-300">
              -{formatCents(totals.creditAppliedCents)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-3 text-base">
            <dt className="font-medium text-zinc-100">
              {isFrozen ? "Invoiced" : billing ? "Total this period" : "Would be billed"}
            </dt>
            <dd className="font-semibold tabular-nums text-zinc-100">
              {formatCents(totalCents)}
            </dd>
          </div>
        </dl>
      </div>

      {isFiltered ? (
        <p className="mt-4 text-xs text-zinc-500">
          The totals above cover the whole period. Filters narrow the chart and
          the breakdown, not what gets billed.
        </p>
      ) : null}

      <p className="mt-4 text-sm leading-6 text-zinc-500">
        {planId === "pro" ? (
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
            Hobby includes enough usage for a side project and is never
            billed. Requests are refused at the cap rather than charged.{" "}
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
