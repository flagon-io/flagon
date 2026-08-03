import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { usageCounters, usageEventRollups } from "../db/schema.js";
import {
  planCreditCents,
  planHardCaps,
  planIncludedEvents,
  planOverage,
  type OverageMode,
} from "../lib/plans.js";
import { EVENTS_METER, chargeCents } from "./meters.js";

/**
 * The events-allowance PICTURE: how a plan's monthly included events compare to
 * what an org has actually used this period. This is what lets us SEE that a
 * Hobby org is over its 500K cap (or a Pro org into overage) whether or not we
 * block anyone — whether ingest is actually REFUSED is the plan's `hardCap`
 * policy (see lib/plans.ts `planHardCaps`), which replaced the old
 * EVENTS_ENFORCEMENT env flag.
 *
 * Usage is read from the atomic monthly counter (org_usage_counters, migration
 * 0019): exact, O(1), and incremented in the same transaction as each durable
 * receipt, so it is consistent-by-construction with the receipts and cheap enough
 * to consult on the ingest hot path once a cap is turned on.
 *
 * The period is the current CALENDAR MONTH (UTC). Stripe metered billing (not on
 * yet) would anchor the period to the subscription instead; when it lands, swap
 * `currentBillingPeriod` for the subscription's period and everything downstream
 * follows.
 */

export type BillingPeriod = { from: string; to: string };

/**
 * A billing cycle window for the usage page: either the org's Stripe subscription
 * period (`stripe`, e.g. the 24th → 24th) or the calendar month (`calendar`, the
 * fallback for orgs with no active subscription). `source` decides how usage is
 * counted: a stripe cycle sums the per-day rollups over the range; a calendar cycle
 * reads the exact atomic monthly counter (the same source enforcement uses). Built
 * by `billingCycle()` in lib/billing.ts.
 */
export type BillingCycle = BillingPeriod & { source: "stripe" | "calendar" };

/** The current calendar-month period (UTC): first of the month through today. */
export function currentBillingPeriod(atMs?: number): BillingPeriod {
  const now = new Date(atMs ?? Date.now());
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

/** The 'YYYY-MM' counter bucket for a billing period (its calendar month). */
function periodKey(period: BillingPeriod): string {
  return period.from.slice(0, 7);
}

/**
 * Total billable events an org recorded within a period — read from the atomic
 * monthly counter (org_usage_counters). One indexed row lookup, exact. Zero when
 * the org has no counter row yet (no events this month).
 */
export async function eventsUsedInPeriod(
  tx: TenantTx,
  period: BillingPeriod,
): Promise<number> {
  const [row] = await tx
    .select({ total: usageCounters.count })
    .from(usageCounters)
    .where(eq(usageCounters.period, periodKey(period)));
  return Number(row?.total ?? 0);
}

/**
 * Total billable events an org recorded within a day range [fromDay, toDay] (inclusive),
 * summed from the per-day usage rollups across every source. Used for a Stripe billing
 * cycle, whose window (e.g. the 24th → 24th) doesn't line up with the calendar-month
 * counter. Org-scoped by RLS inside the withOrg tx, exactly like the counter read above
 * (usage_event_rollups carries flagon_apply_tenant_rls, migration 0010). Days are `date`
 * strings 'YYYY-MM-DD'; future days simply contribute nothing.
 */
export async function eventsUsedInRange(
  tx: TenantTx,
  fromDay: string,
  toDay: string,
): Promise<number> {
  const [row] = await tx
    .select({ total: sql<number>`coalesce(sum(${usageEventRollups.count}), 0)` })
    .from(usageEventRollups)
    .where(
      and(
        gte(usageEventRollups.day, fromDay),
        lte(usageEventRollups.day, toDay),
      ),
    );
  return Number(row?.total ?? 0);
}

export type AllowanceStatus = {
  plan: string;
  overageMode: OverageMode;
  period: BillingPeriod;
  /** Included events for the plan this period (0 for contracted/unknown). */
  includedEvents: number;
  /** Events used this period. */
  usedEvents: number;
  /** Included events still available; null for contracted plans (no allowance). */
  remainingEvents: number | null;
  /** Events beyond the included allowance (0 for contracted plans). */
  overageEvents: number;
  /** True when a plan with an allowance has used more than it includes. */
  isOver: boolean;
  /** Projected overage charge in cents — only for "bill" plans; 0 otherwise. */
  overageCents: number;
  /**
   * Whether this plan HARD-CAPS: refuses ingest once over its allowance. When
   * false (today, for every plan) going over is measured + warned, never blocked.
   * The console uses this to choose "sending is paused" vs "upgrade to raise your
   * limit" copy.
   */
  hardCap: boolean;
  /** The plan's monthly usage credit in cents ($50 = 5000 for Pro, equal to the base
   *  fee and covering the ~1.67M included at $0.03/1K; 0 otherwise). Internal Stripe number. */
  creditCents: number;
  /** How much of the credit this period's usage has drawn down (capped at creditCents). */
  creditUsedCents: number;
};

/**
 * Compute an org's events-allowance status for its current billing cycle.
 *
 * With a `cycle` (the org's Stripe subscription period, passed by the usage route),
 * the window and usage follow that cycle — a stripe cycle sums the per-day rollups
 * over its range, so the console matches the customer's actual invoice window. Without
 * one (enforcement on the ingest hot path, and any Hobby org) it falls back to the
 * calendar month read from the exact atomic counter — the original behavior, unchanged.
 */
export async function eventsAllowanceStatus(
  tx: TenantTx,
  plan: string,
  cycle?: BillingCycle,
  atMs?: number,
): Promise<AllowanceStatus> {
  const period: BillingPeriod = cycle ?? currentBillingPeriod(atMs);
  const overageMode = planOverage(plan);
  const includedEvents = planIncludedEvents(plan);
  const usedEvents =
    cycle?.source === "stripe"
      ? await eventsUsedInRange(tx, cycle.from, cycle.to)
      : await eventsUsedInPeriod(tx, period);

  // Contracted plans have no allowance to be "over": their usage is shown as
  // volume against a term envelope elsewhere, so never flag them here.
  const contracted = overageMode === "contract";
  const overageEvents = contracted ? 0 : Math.max(0, usedEvents - includedEvents);
  const isOver = !contracted && usedEvents > includedEvents;
  const remainingEvents = contracted ? null : Math.max(0, includedEvents - usedEvents);
  const overageCents =
    overageMode === "bill" ? chargeCents(EVENTS_METER, overageEvents) : 0;

  // The Vercel-style credit drawdown: how much of the $50 this month's usage has
  // spent, capped at the credit. Gross usage priced at the meter rate; the console
  // renders "$X of $50 used".
  const creditCents = planCreditCents(plan);
  const grossUsageCents = chargeCents(EVENTS_METER, usedEvents);
  const creditUsedCents = Math.min(Math.round(grossUsageCents), creditCents);

  return {
    plan,
    overageMode,
    period,
    includedEvents,
    usedEvents,
    remainingEvents,
    overageEvents,
    isOver,
    overageCents,
    hardCap: planHardCaps(plan),
    creditCents,
    creditUsedCents,
  };
}

/**
 * Whether ingest should be REFUSED for this status: only when the plan hard-caps
 * AND it's a "cap" plan AND it's over. "bill"/"contract" plans are never refused
 * (they meter/true-up instead), and a plan with hardCap off is never refused
 * (warn-first). This is the one predicate the exposures route consults.
 */
export function isIngestCapped(status: AllowanceStatus): boolean {
  return (
    status.hardCap &&
    status.overageMode === "cap" &&
    status.isOver
  );
}
