import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { planVersionMeters, planVersions } from "@/db/schema";
import { PLANS, isPlanId, type PlanId } from "./plans";
import { getMeter } from "./meters";
import { resolveStripePriceId } from "./billing";

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

/**
 * How long a public page may serve cached plan data.
 *
 * Marketing pages were STATIC, which quietly broke the whole point of putting
 * plans in the database: publishing a price in the operator console changed
 * nothing on the website until the next deploy. Fully dynamic is the other
 * extreme - the pricing page is the most-hit unauthenticated route and does not
 * need a database round trip per visitor.
 *
 * A minute is the compromise: a price change is live before the operator has
 * finished checking it, and the page still serves from cache under load.
 *
 * The operator console cannot call revalidatePath() for these: it is a separate
 * Vercel project with its own cache, so a time-based window is the only
 * mechanism available across that boundary.
 */
export const PLAN_PAGE_REVALIDATE = 60;

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

export type PlanVersion = {
  id: string | null;
  plan: PlanId;
  version: number;
  status: "active" | "legacy" | "draft";
  label: string;
  /** False for an unbilled tier: no Stripe price, no invoice, not "$0.00/mo". */
  billable: boolean;
  unitAmountCents: number | null;
  currency: string;
  interval: string;
  includedCreditCents: number | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
  displayName: string;
  tagline: string;
  features: string[];
  listed: boolean;
  highlight: boolean;
  selfServe: boolean;
  sortOrder: number;
  maxProjects: number | null;
  maxMembers: number | null;
  maxFreeOrgs: number | null;
  effectiveFrom: string | null;
  note: string | null;
  meters: PlanMeterTerm[];
};

/**
 * A plan version in the shape the marketing columns render.
 *
 * Kept here rather than in the component so every surface that shows plans -
 * the pricing page, the org-creation flow, the console's preview - maps them
 * identically, and a plan can never look like one thing on the website and
 * another inside the product.
 */
export function toPlanColumn(version: PlanVersion): {
  id: string;
  displayName: string;
  tagline: string;
  features: string[];
  billable: boolean;
  unitAmountCents: number | null;
  interval: string;
  highlight: boolean;
  selfServe: boolean;
  plan: PlanId;
  copy: {
    includedCreditCents: number | null;
    unitAmountCents: number | null;
    interval: string;
    maxProjects: number | null;
    maxMembers: number | null;
    maxFreeOrgs: number | null;
    meters: {
      meter: string;
      mode: "included" | "metered" | "unavailable";
      includedQuantity: number;
      hardCap: number | null;
    }[];
  };
} {
  return {
    id: version.id ?? version.plan,
    plan: version.plan,
    displayName: version.displayName,
    tagline: version.tagline,
    features: version.features,
    billable: version.billable,
    unitAmountCents: version.unitAmountCents,
    interval: version.interval,
    highlight: version.highlight,
    selfServe: version.selfServe,
    copy: {
      includedCreditCents: version.includedCreditCents,
      unitAmountCents: version.unitAmountCents,
      interval: version.interval,
      maxProjects: version.maxProjects,
      maxMembers: version.maxMembers,
      maxFreeOrgs: version.maxFreeOrgs,
      meters: version.meters.map((term) => ({
        meter: term.meter,
        mode: term.mode,
        includedQuantity: term.includedQuantity,
        hardCap: term.hardCap,
      })),
    },
  };
}

/** One meter's terms on a version, or null when the plan never mentions it. */
export function termFor(
  version: PlanVersion,
  meterId: string,
): PlanMeterTerm | null {
  return version.meters.find((term) => term.meter === meterId) ?? null;
}

/**
 * The effective rate for a meter on a plan: the plan's override if it sets one,
 * else the meter's published rate, with the plan's included quantity folded in.
 *
 * Returns null for a meter the plan marks `unavailable` - there is no price for
 * something that is not offered, and pricing it at the published rate would
 * quietly bill for a product the customer was told they do not have.
 */
export function planRateFor(
  version: PlanVersion,
  meterId: string,
): { unitAmountCents: number; per: number; includedQuantity: number } | null {
  const meter = getMeter(meterId);
  if (!meter) return null;

  const term = termFor(version, meterId);
  if (term?.mode === "unavailable") return null;

  return {
    unitAmountCents: term?.unitAmountCents ?? meter.unitAmountCents,
    per: term?.per ?? meter.per,
    includedQuantity: term?.includedQuantity ?? 0,
  };
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
    displayName: constants.name,
    tagline: constants.tagline,
    features: [...constants.features],
    listed: true,
    highlight: plan === "pro",
    selfServe: plan !== "enterprise",
    sortOrder: plan === "free" ? 10 : plan === "pro" ? 20 : 30,
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
    displayName: row.displayName || row.label,
    tagline: row.tagline,
    features: Array.isArray(row.features) ? row.features : [],
    listed: row.listed,
    highlight: row.highlight,
    selfServe: row.selfServe,
    sortOrder: row.sortOrder,
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
    .orderBy(asc(planVersions.sortOrder), asc(planVersions.plan));
  const meters = await metersFor(rows.map((row) => row.id));
  return rows
    .map((row) => toVersion(row, meters.get(row.id) ?? []))
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.plan.localeCompare(b.plan) ||
        b.version - a.version,
    );
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

/**
 * The versions the pricing page shows: listed, active, in display order.
 *
 * Falls back to the constants when the database has none, so the marketing site
 * never renders an empty pricing page because of a migration or an outage.
 */
export async function listedPlanVersions(): Promise<PlanVersion[]> {
  try {
    const rows = await db
      .select()
      .from(planVersions)
      .where(and(eq(planVersions.status, "active"), eq(planVersions.listed, true)))
      .orderBy(asc(planVersions.sortOrder));

    if (rows.length) {
      const meters = await metersFor(rows.map((row) => row.id));
      return rows.map((row) => toVersion(row, meters.get(row.id) ?? []));
    }
  } catch {
    // Fall through: a pricing page that 500s is worse than one a migration
    // behind.
  }
  return [fallbackVersion("free"), fallbackVersion("pro"), fallbackVersion("enterprise")];
}
