import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getMembershipBySlug } from "@/lib/org";
import {
  planName,
  planIncludedEvents,
  planOverage,
  planBaseCents,
} from "@/lib/plans";
import {
  getOrgUsage,
  type OrgUsage,
  type UsageGroupBy,
  type UsageSeries,
} from "@/lib/flags-api";
import { MAX_SERIES, OTHER_COLOR, seriesColor } from "./colors";
import { charge, compact, rate, usd } from "./format";
import { ConsumptionBreakdown } from "./consumption-breakdown";
import { UsageFilters } from "./filters";
import { Sparkline } from "./sparkline";

export const metadata: Metadata = { title: "Usage" };

const RANGE_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90 };

/** The full active billing cycle, including future zero-filled days. */
function currentCycle(): { from: string; to: string } {
  const now = new Date();
  return {
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10),
  };
}

function dayString(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

function rangeLabel(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(from)} – ${fmt(to)}`;
}

export default async function UsagePage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ range?: string; groupBy?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const membership = await getMembershipBySlug(session.user.id, slug);
  if (!membership) notFound();

  const range =
    sp.range === "cycle" || (sp.range && RANGE_DAYS[sp.range])
      ? sp.range
      : "cycle";
  // "meter" is the default (the billing view: per-product usage lines, mirroring
  // Vercel's by-product structure). flag/environment/reason are exploratory lenses
  // that slice flag evaluations. Project isn't a dimension — evaluations aren't
  // attributed to a project in the schema (flags/envs are org-level, global).
  const GROUP_BY: UsageGroupBy[] = ["meter", "flag", "environment", "reason"];
  const groupBy: UsageGroupBy = GROUP_BY.includes(sp.groupBy as UsageGroupBy)
    ? (sp.groupBy as UsageGroupBy)
    : "meter";
  // For the "cycle" view, omit from/to so the API windows to the org's REAL billing
  // cycle (its Stripe subscription period, else the calendar month). For a fixed range
  // (7/30/90), send explicit dates. The bar (entitlement) always reflects the cycle.
  const days = range === "cycle" ? null : RANGE_DAYS[range]!;
  const reqFrom = days ? dayString(days - 1) : undefined;
  const reqTo = days ? dayString(0) : undefined;

  const result = await getOrgUsage(slug, { from: reqFrom, to: reqTo, groupBy });
  const usage = result?.usage ?? null;
  // The events-allowance status is for the org's current BILLING CYCLE (independent of
  // the chart range), so the bar reflects the real cycle whatever range is shown.
  const entitlement = result?.entitlement ?? null;

  // Label from the API's returned range — authoritative for the cycle (24th→24th on a
  // subscription). Fall back to the local calendar month only if the request failed.
  const fallbackCycle = currentCycle();
  const from = usage?.range.from ?? reqFrom ?? fallbackCycle.from;
  const to = usage?.range.to ?? reqTo ?? fallbackCycle.to;

  const plan = membership.plan;
  const includedEvents = planIncludedEvents(plan);
  const baseCents = planBaseCents(plan);
  // How this plan treats events past the allowance: "cap" (free ceiling, never
  // billed — Hobby), "bill" (metered overage — Pro), "contract" (Enterprise).
  const overageMode = planOverage(plan);
  const bills = overageMode === "bill";

  // Billable usage is metered in events (free checks never charge). Sum ACROSS every
  // billable line — there is one per product/source now, so the allowance and invoice
  // are on total billable events however many products produced them. usage counts
  // the events, chargeCents is the GROSS charge (every event priced); on a billing
  // plan the allowance offsets the first `includedEvents` and the rest is overage, on
  // a cap plan nothing is charged (the ceiling limits access instead).
  const billableSeries = usage?.series.filter((s) => s.billable) ?? [];
  const usedEvents = billableSeries.reduce((sum, s) => sum + s.usage, 0);
  const grossEventCents = billableSeries.reduce(
    (sum, s) => sum + s.chargeCents,
    0,
  );
  const overageEvents = Math.max(0, usedEvents - includedEvents);
  // Overage is the share of the GROSS charge attributable to events past the
  // allowance. Deriving it from the gross (rather than one series' per-million rate)
  // is exact when every billable series shares one rate AND stays correct if two
  // products ever price differently — the allowance offsets a proportional slice of
  // each series instead of being charged at series[0]'s rate against the aggregate.
  const overageCents =
    bills && usedEvents > 0
      ? Math.round(grossEventCents * (overageEvents / usedEvents))
      : 0;
  const includedAppliedCents = bills ? grossEventCents - overageCents : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
            {planName(plan)} Plan Usage
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {range === "cycle" ? "Current billing cycle" : "Selected range"} ·{" "}
            {rangeLabel(from, to)} · usage across every product. Checks are
            free; exposures are metered.
          </p>
        </div>
        <UsageFilters base={`/${slug}/usage`} range={range} groupBy={groupBy} />
      </div>

      {entitlement && entitlement.includedEvents > 0 ? (
        // Both plans show the EVENT allowance (X of N events), never a dollar credit:
        // Hobby is the free ceiling (hard cap), Pro is "included then overage". Keeping
        // it event-based means the customer sees "$50/mo, ~1.7M events", never an internal
        // credit dollar figure. The dollar detail lives in the invoice table below.
        <EventsBar
          usedEvents={entitlement.usedEvents}
          includedEvents={entitlement.includedEvents}
          overageEvents={entitlement.overageEvents}
          bills={entitlement.overageMode === "bill"}
          enforcing={entitlement.hardCap}
        />
      ) : null}

      <ConsumptionBreakdown
        periods={usage?.periods ?? []}
        series={usage?.series ?? []}
      />

      <UsageTable
        usage={usage}
        planLabel={planName(plan)}
        baseCents={baseCents}
        bills={bills}
        includedEvents={includedEvents}
        includedAppliedCents={includedAppliedCents}
        overageCents={overageCents}
      />
    </div>
  );
}

/**
 * The event allowance burn-down for the current BILLING CYCLE. On a billing plan
 * it is the "Included Events" you draw down before overage; on a cap plan (free
 * tier) it is the "Free Events" ceiling, and reaching it means upgrade, not a bill.
 * `enforcing` tells whether the cap is actually blocking yet (it is off until
 * billing turns on); until then, going over is a signal, not a stop.
 */
function EventsBar({
  usedEvents,
  includedEvents,
  overageEvents,
  bills,
  enforcing,
}: {
  usedEvents: number;
  includedEvents: number;
  overageEvents: number;
  bills: boolean;
  enforcing: boolean;
}) {
  const pct = Math.min(1, usedEvents / includedEvents);
  const over = usedEvents > includedEvents;
  return (
    <section className="rounded-xl border border-white/10 bg-white/2 px-5 py-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-300">
          {bills ? "Included Events" : "Free Events"}
        </span>
        <span className="text-zinc-400 tabular-nums">
          <span className={over ? "text-amber-400" : "text-zinc-200"}>
            {compact(usedEvents)}
          </span>{" "}
          / {compact(includedEvents)} this cycle
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={usedEvents}
        aria-valuemin={0}
        aria-valuemax={includedEvents}
        aria-label={`${compact(usedEvents)} of ${compact(includedEvents)} events used this cycle`}
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/8"
      >
        <div
          className={`h-full rounded-full ${over ? "bg-amber-500" : "bg-[#3987e5]"}`}
          style={{ width: `${Math.max(pct * 100, usedEvents > 0 ? 2 : 0)}%` }}
        />
      </div>
      {over ? (
        <p className="mt-2 text-xs text-amber-400/90">
          {bills
            ? `${compact(overageEvents)} events beyond your allowance this cycle.${
                enforcing
                  ? " Billed at the usage rate."
                  : " Enforcement is off, so this is a projection."
              }`
            : `You've reached your ${compact(includedEvents)} free events this cycle.${
                enforcing
                  ? " Sending is paused until you upgrade to Pro."
                  : " Enforcement is off, so sending continues; upgrade to Pro to raise your limit."
              }`}
        </p>
      ) : null}
    </section>
  );
}

const ROW_GRID =
  "grid grid-cols-[1fr_7rem_5rem] items-center gap-4 px-5 sm:grid-cols-[1fr_6rem_7rem_5rem]";

/** A muted product/section band inside the invoice table. */
function SectionHeader({ label }: { label: string }) {
  return (
    <div className="border-b border-white/8 bg-white/2 px-5 py-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
      {label}
    </div>
  );
}

/**
 * The invoice: usage line items grouped into per-product bands (Feature Flags,
 * Platform, ...), then the plan's subscription line, then the subtotals. On a
 * billing plan (`bills`) events are priced gross, the plan's monthly allowance
 * offsets the first `includedEvents`, and Total = base + overage. On a cap plan
 * events are free within the ceiling and never billed, so the events line reads
 * Free and Total is just the base fee. Free meters (flag checks) never contribute.
 */
function UsageTable({
  usage,
  planLabel,
  baseCents,
  bills,
  includedEvents,
  includedAppliedCents,
  overageCents,
}: {
  usage: OrgUsage | null;
  planLabel: string;
  baseCents: number;
  bills: boolean;
  includedEvents: number;
  includedAppliedCents: number;
  overageCents: number;
}) {
  const series = usage?.series ?? [];
  // Group line items into per-product bands, preserving first-appearance order so
  // the free "Feature Flags" checks come before the billable "Platform" events,
  // and any future product gets its own band. Colors stay keyed to the flat order.
  const colorOf = new Map(series.map((s, i) => [s.key, i]));
  const groups: { product: string; lines: UsageSeries[] }[] = [];
  for (const s of series) {
    let g = groups.find((x) => x.product === s.product);
    if (!g) {
      g = { product: s.product, lines: [] };
      groups.push(g);
    }
    g.lines.push(s);
  }
  // A product's charge is the sum of its billable lines (only on a billing plan).
  const productCharge = (lines: UsageSeries[]) =>
    bills
      ? lines.reduce((sum, l) => sum + (l.billable ? l.chargeCents : 0), 0)
      : 0;
  const totalDue = baseCents + overageCents;

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-white/2">
      {/* Column labels */}
      <div
        className={`${ROW_GRID} border-b border-white/8 py-3 text-xs font-medium tracking-wide text-zinc-500 uppercase`}
      >
        <span>Product</span>
        <span className="hidden sm:block" />
        <span className="text-right">Usage</span>
        <span className="text-right">Charge</span>
      </div>

      {/* Per-product usage bands */}
      {series.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-zinc-500">
          No usage recorded in this range yet.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.product}>
            <SectionHeader label={g.product} />
            <ul>
              {g.lines.map((s) => {
                const i = colorOf.get(s.key) ?? 0;
                const color = i < MAX_SERIES ? seriesColor(i) : OTHER_COLOR;
                return (
                  <li
                    key={s.key}
                    className={`${ROW_GRID} border-b border-white/5 py-3`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-zinc-200">
                            {s.label}
                          </span>
                          {!s.billable ? (
                            <span className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-medium tracking-wide text-zinc-500 uppercase">
                              Free
                            </span>
                          ) : !s.tracked ? (
                            <span className="rounded border border-amber-500/20 px-1 py-0.5 text-[9px] font-medium tracking-wide text-amber-400/80 uppercase">
                              Not metered yet
                            </span>
                          ) : !bills ? (
                            <span className="rounded border border-white/10 px-1 py-0.5 text-[9px] font-medium tracking-wide text-zinc-500 uppercase">
                              Included
                            </span>
                          ) : null}
                        </div>
                        {/* The per-unit rate, so the price is visible on every
                            billable meter — used or not — and reads as it adds up. */}
                        {s.billable && bills ? (
                          <span className="block text-[11px] text-zinc-600 tabular-nums">
                            {rate(s.pricePerMillionCents, s.unit)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="hidden justify-end sm:flex">
                      <Sparkline
                        values={s.points.map((p) => p.usage)}
                        color={color}
                      />
                    </span>
                    <span className="text-right text-sm text-zinc-300 tabular-nums">
                      {compact(s.usage)}
                      <span className="ml-1 text-zinc-600">
                        {s.usage === 1 ? s.unit : `${s.unit}s`}
                      </span>
                    </span>
                    <span className="text-right text-sm text-zinc-400 tabular-nums">
                      {s.billable ? (bills ? charge(s.chargeCents) : "Free") : "Free"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}

      {/* Subscription section */}
      <SectionHeader label="Subscription" />
      <div className={`${ROW_GRID} py-3`}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full bg-[#3987e5]" />
          <span className="truncate text-sm text-zinc-200">
            {planLabel} plan
          </span>
        </div>
        <span className="hidden sm:block" />
        <span className="text-right text-sm text-zinc-500 tabular-nums">
          1<span className="ml-1 text-zinc-600">/mo</span>
        </span>
        <span className="text-right text-sm text-zinc-300 tabular-nums">
          {usd(baseCents)}
        </span>
      </div>

      {/* Totals */}
      <div className="flex flex-col items-end gap-1 border-t border-white/8 px-5 py-4 text-sm">
        <Row label="Subscription Subtotal" value={usd(baseCents)} />
        {groups
          .filter((g) => productCharge(g.lines) > 0)
          .map((g) => (
            <Row
              key={g.product}
              label={`${g.product} Subtotal`}
              value={charge(productCharge(g.lines))}
            />
          ))}
        {bills && includedEvents > 0 ? (
          <Row
            label="Included Events Applied"
            value={`-${charge(includedAppliedCents)}`}
            muted
          />
        ) : null}
        <div className="mt-1 flex w-full max-w-xs items-center justify-between border-t border-white/10 pt-2 font-semibold text-zinc-100">
          <span>Total</span>
          <span className="tabular-nums">{usd(totalDue)}</span>
        </div>
      </div>

      <p className="border-t border-white/8 px-5 py-3 text-xs text-zinc-600">
        {includedEvents > 0
          ? bills
            ? `Your plan includes ${compact(includedEvents)} events per cycle; you only pay for events beyond it.`
            : `Your plan includes up to ${compact(includedEvents)} events per cycle, free. Past that, sending pauses until you upgrade to Pro, we never bill you on the free plan.`
          : "Events are billed against your contracted volume."}{" "}
        Checks are free; exposures are the metered unit. This is your running total
        for the current billing cycle; the final invoice is issued at the end of it.
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex w-full max-w-xs items-center justify-between">
      <span className="text-zinc-500">{label}</span>
      <span
        className={`tabular-nums ${muted ? "text-zinc-400" : "text-zinc-300"}`}
      >
        {value}
      </span>
    </div>
  );
}
