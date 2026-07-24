import { cache } from "react";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { planVersionMeters, planVersions } from "@/db/schema";
import { PLANS, isPlanId, type PlanId } from "./plans";
import { getMeter } from "./meters";
import { resolveStripePriceId } from "./billing";
import type { ProHeadline } from "./marketing-plans";

/**
 * Reading plans from the database (drizzle/0037).
 *
 * A plan is DATA now: its price, what it includes, what it ceilings, what it
 * limits, and the words the pricing page uses are one row plus its per-meter
 * rows. This module is the only place that reads them, and everything else -
 * entitlement resolution, quota enforcement, Checkout, the marketing page, the
 * operator console - goes through it.
 *
 * THE CONSTANTS ARE NOW A FALLBACK, NOT THE SOURCE. src/lib/plans.ts still
 * declares PLANS, and it still matters: a self-host that has not run 0037, a
 * database that is briefly unreachable, and every unit test resolve through it.
 * But a deployment that HAS run the migration never reads it, because the row
 * always wins. Keeping the fallback is what lets this ship without a
 * coordinated migrate-and-deploy.
 */

export type PlanMeterTerm = {
  meter: string;
  /**
   * included    a quantity comes with the plan; past it, priced (or refused).
   * metered     nothing included; billed from the first unit.
   * unavailable the plan does not offer this product at all.
   */
  mode: "included" | "metered" | "unavailable";
  includedQuantity: number;
  /** Cents per `per` units on THIS plan. Null inherits the published rate. */
  unitAmountCents: number | null;
  per: number | null;
  /** Units before requests are refused. Null = bill instead of refusing. */
  hardCap: number | null;
};

/**
 * A plan version: the BILLING half of a plan, versioned. Marketing copy
 * (display name, tagline, feature bullets) is no longer here - it lives as
 * static content in flagon's marketing pages (src/lib/marketing-plans.ts). This
 * row is the price/entitlement version an org resolves through, and the thing
 * that makes grandfathering and scheduled repricing possible.
 */
export type PlanVersion = {
  id: string | null;
  plan: PlanId;
  version: number;
  status: "active" | "legacy" | "draft";
  /** Operator-facing identifier, e.g. "Pro 2026". Not customer marketing. */
  label: string;
  /** False for an unbilled tier: no Stripe price, no invoice, not "$0.00/mo". */
  billable: boolean;
  unitAmountCents: number | null;
  currency: string;
  interval: string;
  includedCreditCents: number | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
  maxProjects: number | null;
  maxMembers: number | null;
  maxFreeOrgs: number | null;
  effectiveFrom: string | null;
  note: string | null;
  meters: PlanMeterTerm[];
};

/** One meter's terms on a version, or null when the plan never mentions it. */
export function termFor(
  version: PlanVersion,
  meterId: string,
): PlanMeterTerm | null {
  return version.meters.find((term) => term.meter === meterId) ?? null;
}

/**
 * The plan constants, shaped as a version. The fallback when the database has
 * no row - a pre-0037 deployment, or a unit test with no database.
 *
 * Hobby's evaluation ceiling is DERIVED here (from its credit at the published
 * rate) purely to reproduce the pre-0037 behaviour exactly. The database seeds
 * it as a declared 10,000,000, which is the same number stated rather than
 * computed; once a row exists, this derivation is never reached.
 */
export function fallbackVersion(plan: PlanId): PlanVersion {
  const constants = PLANS[plan];
  const billable = plan !== "free";
  const credit = constants.includedUsageCents;

  const meters: PlanMeterTerm[] = [];
  for (const meterId of ["flags.evaluations", "flags.syncs"]) {
    const meter = getMeter(meterId);
    if (!meter) continue;
    const allowances = constants.meterAllowances as Record<string, number>;
    const caps = constants.hardCaps as Record<string, number>;

    let hardCap = caps[meterId] ?? null;
    if (plan === "free" && meterId === "flags.evaluations" && meter.unitAmountCents > 0) {
      hardCap = Math.floor((credit / meter.unitAmountCents) * meter.per);
    }

    meters.push({
      meter: meterId,
      mode: "included",
      includedQuantity: allowances[meterId] ?? 0,
      unitAmountCents: null,
      per: null,
      hardCap,
    });
  }

  return {
    id: null,
    plan,
    version: 0,
    status: "active",
    label: constants.name,
    billable,
    unitAmountCents:
      constants.priceMonthly != null ? constants.priceMonthly * 100 : null,
    currency: "usd",
    interval: "month",
    includedCreditCents: billable ? credit : null,
    stripePriceId: null,
    stripeProductId: null,
    maxProjects: Number.isFinite(constants.limits.projects)
      ? constants.limits.projects
      : null,
    maxMembers: Number.isFinite(constants.limits.members)
      ? constants.limits.members
      : null,
    maxFreeOrgs: Number.isFinite(constants.limits.freeOrgsPerUser)
      ? constants.limits.freeOrgsPerUser
      : null,
    effectiveFrom: null,
    note: null,
    meters,
  };
}

type Row = typeof planVersions.$inferSelect;

function toVersion(row: Row, meters: PlanMeterTerm[]): PlanVersion {
  return {
    id: row.id,
    plan: isPlanId(row.plan) ? row.plan : "free",
    version: row.version,
    status:
      row.status === "active" || row.status === "legacy" ? row.status : "draft",
    label: row.label,
    billable: row.billable,
    unitAmountCents: row.unitAmountCents,
    currency: row.currency,
    interval: row.interval,
    includedCreditCents: row.includedCreditCents,
    stripePriceId: row.stripePriceId,
    stripeProductId: row.stripeProductId,
    maxProjects: row.maxProjects,
    maxMembers: row.maxMembers,
    maxFreeOrgs: row.maxFreeOrgs,
    effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom) : null,
    note: row.note,
    meters,
  };
}

/** Per-meter terms for a set of versions, keyed by version id. */
async function metersFor(
  versionIds: string[],
): Promise<Map<string, PlanMeterTerm[]>> {
  const byVersion = new Map<string, PlanMeterTerm[]>();
  if (!versionIds.length) return byVersion;

  const rows = await db
    .select()
    .from(planVersionMeters)
    .where(inArray(planVersionMeters.planVersionId, versionIds));

  for (const row of rows) {
    const terms = byVersion.get(row.planVersionId) ?? [];
    terms.push({
      meter: row.meter,
      mode:
        row.mode === "metered" || row.mode === "unavailable"
          ? row.mode
          : "included",
      includedQuantity: Number(row.includedQuantity),
      unitAmountCents: row.unitAmountCents,
      per: row.per != null ? Number(row.per) : null,
      hardCap: row.hardCap != null ? Number(row.hardCap) : null,
    });
    byVersion.set(row.planVersionId, terms);
  }
  return byVersion;
}

/** One version by id, with its meter terms. */
export async function planVersionById(
  id: string,
): Promise<PlanVersion | null> {
  const [row] = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.id, id))
    .limit(1);
  if (!row) return null;
  const meters = await metersFor([row.id]);
  return toVersion(row, meters.get(row.id) ?? []);
}

/**
 * The version a plan is currently SOLD at.
 *
 * Falls back to the constants rather than throwing: a deployment that has not
 * run 0037 must keep working, and so must a plan whose row was never seeded.
 */
export async function activePlanVersion(plan: PlanId): Promise<PlanVersion> {
  const [row] = await db
    .select()
    .from(planVersions)
    .where(and(eq(planVersions.plan, plan), eq(planVersions.status, "active")))
    .limit(1);
  if (!row) return fallbackVersion(plan);
  const meters = await metersFor([row.id]);
  return toVersion(row, meters.get(row.id) ?? []);
}

/**
 * The live Pro headline for the STATIC marketing pages: the price and included
 * credit the active Pro version actually sells at.
 *
 * The marketing copy is static (src/lib/marketing-plans.ts); this is the one
 * number that must track billing, so the public price can never disagree with
 * what a new signup is charged. Everything else on those pages is code. Falls
 * back to the PLANS constants through activePlanVersion, so it is safe on a
 * self-host with no rows and in tests.
 *
 * React-cached so the three marketing surfaces that call it in one render share
 * a single query.
 */
export const proHeadline = cache(async (): Promise<ProHeadline> => {
  const version = await activePlanVersion("pro").catch(() =>
    fallbackVersion("pro"),
  );
  return {
    priceCents: version.unitAmountCents ?? PLANS.pro.priceMonthly * 100,
    interval: version.interval,
    includedCreditCents:
      version.includedCreditCents ?? PLANS.pro.includedUsageCents,
  };
});

/**
 * The version an org is on: its pinned one, else its plan's active one.
 *
 * The pin is what makes grandfathering automatic - publishing a new version
 * moves nobody, because every existing org still points at the row it bought.
 */
export async function versionForOrg(input: {
  plan: PlanId;
  planVersionId: string | null;
}): Promise<PlanVersion> {
  if (input.planVersionId) {
    const pinned = await planVersionById(input.planVersionId);
    // A pinned version whose plan no longer matches the org's is stale (the org
    // was moved between plans without its pin being updated). The plan column
    // wins: it is what the subscription and the webhook agree on.
    if (pinned && pinned.plan === input.plan) return pinned;
  }
  return activePlanVersion(input.plan);
}

/** Every version of every plan, newest first within each plan. For the console. */
export async function allPlanVersions(): Promise<PlanVersion[]> {
  const rows = await db
    .select()
    .from(planVersions)
    .orderBy(asc(planVersions.plan));
  const meters = await metersFor(rows.map((row) => row.id));
  return rows
    .map((row) => toVersion(row, meters.get(row.id) ?? []))
    .sort((a, b) => a.plan.localeCompare(b.plan) || b.version - a.version);
}

/**
 * The Stripe price a new self-serve subscription should be put on, plus the
 * version it corresponds to.
 *
 * Resolution order: the active version's linked Stripe price, then
 * STRIPE_PRO_PRICE_ID as a bootstrap for a deployment that has not linked one
 * yet (`npm run price:link`). Null when neither exists; the caller decides
 * whether to fall back to lookup_key/auto-create or refuse.
 *
 * An unbilled version resolves to null by construction - it has no price to put
 * anyone on, which is the correct answer rather than an error.
 */
export async function stripePriceForCheckout(
  plan: PlanId = "pro",
): Promise<{ priceId: string; planVersionId: string | null } | null> {
  const version = await activePlanVersion(plan).catch(() => null);
  if (version && !version.billable) return null;

  if (version?.stripePriceId) {
    return {
      priceId: await resolveStripePriceId(version.stripePriceId),
      planVersionId: version.id,
    };
  }

  const fromEnv = process.env.STRIPE_PRO_PRICE_ID;
  if (plan === "pro" && fromEnv) {
    return {
      priceId: await resolveStripePriceId(fromEnv),
      planVersionId: version?.id ?? null,
    };
  }
  return null;
}

