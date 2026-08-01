import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { TenantTx } from "../db/tenant.js";
import { usageEventRollups } from "../db/schema.js";
import { env } from "../env.js";
import { planIncludedEvents, planOverage, type OverageMode } from "../lib/plans.js";
import { EVENTS_METER, chargeCents } from "./meters.js";

/**
 * The events-allowance PICTURE: how a plan's monthly included events compare to
 * what an org has actually used this period. This is what lets us SEE that a
 * Hobby org is over its 2M cap (or a Pro org into overage) without billing or
 * blocking anyone — enforcement is a separate, env-gated switch (see
 * `eventsEnforcement`). Usage is derived from the durable rollups
 * (usage_event_rollups), not a separate counter, which is exact and enough while
 * enforcement is off; a hot-path atomic counter is only needed once we actually
 * cut orgs off.
 *
 * The period is the current CALENDAR MONTH (UTC). Stripe metered billing (not on
 * yet) would anchor the period to the subscription instead; when it lands, swap
 * `currentBillingPeriod` for the subscription's period and everything downstream
 * follows.
 */

export type BillingPeriod = { from: string; to: string };

/** The current calendar-month period (UTC): first of the month through today. */
export function currentBillingPeriod(atMs?: number): BillingPeriod {
  const now = new Date(atMs ?? Date.now());
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

/** Total billable events an org recorded within a period (from the rollups). */
export async function eventsUsedInPeriod(
  tx: TenantTx,
  period: BillingPeriod,
): Promise<number> {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${usageEventRollups.count}), 0)` })
    .from(usageEventRollups)
    .where(
      and(
        gte(usageEventRollups.day, period.from),
        lte(usageEventRollups.day, period.to),
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
  /** Current enforcement mode; "off" means over-allowance never blocks. */
  enforcement: "off" | "enforce";
};

/** Compute an org's events-allowance status for the current period. */
export async function eventsAllowanceStatus(
  tx: TenantTx,
  plan: string,
  atMs?: number,
): Promise<AllowanceStatus> {
  const period = currentBillingPeriod(atMs);
  const overageMode = planOverage(plan);
  const includedEvents = planIncludedEvents(plan);
  const usedEvents = await eventsUsedInPeriod(tx, period);

  // Contracted plans have no allowance to be "over": their usage is shown as
  // volume against a term envelope elsewhere, so never flag them here.
  const contracted = overageMode === "contract";
  const overageEvents = contracted ? 0 : Math.max(0, usedEvents - includedEvents);
  const isOver = !contracted && usedEvents > includedEvents;
  const remainingEvents = contracted ? null : Math.max(0, includedEvents - usedEvents);
  const overageCents =
    overageMode === "bill" ? chargeCents(EVENTS_METER, overageEvents) : 0;

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
    enforcement: env.EVENTS_ENFORCEMENT,
  };
}

/** The configured enforcement mode. "off" never blocks; "enforce" activates caps. */
export function eventsEnforcement(): "off" | "enforce" {
  return env.EVENTS_ENFORCEMENT;
}

/**
 * Whether ingest should be REFUSED for this status: only when enforcement is on
 * AND the plan is a hard cap AND it's over. "bill"/"contract" plans are never
 * refused (they meter/true-up instead), and with enforcement off nothing is ever
 * refused. This is the one predicate the exposures route consults.
 */
export function isIngestCapped(status: AllowanceStatus): boolean {
  return (
    status.enforcement === "enforce" &&
    status.overageMode === "cap" &&
    status.isOver
  );
}
