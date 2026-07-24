import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import {
  resolveEntitlements,
  type Entitlements,
  type PriceEntitlements,
} from "./entitlements";
import {
  versionForOrg,
  type PlanVersion,
} from "./plan-catalog.server";
import { isPlanId, type PlanId } from "./plans";

/**
 * Reading an organization's entitlements out of the database.
 *
 * The pure layering lives in entitlements.ts; this file's only job is to fetch
 * the org's plan version and hand it over: one query for the org, one for the
 * version it points at.
 *
 * Everything here degrades to the plan constants. A missing price row, or a
 * database that has not run 0037 yet, resolves to exactly the behaviour that
 * existed before this system, which is what makes it safe to deploy ahead of
 * the operator console that writes into it.
 */

export type OrgEntitlementContext = {
  plan: PlanId;
  /** The full plan version the org is on: price, terms, limits, copy. */
  version: PlanVersion;
  entitlements: Entitlements;
  /** The commercial half of that version, for surfaces that only need it. */
  price: {
    id: string | null;
    label: string;
    unitAmountCents: number | null;
    currency: string;
    interval: string;
    status: string;
  } | null;
};

/**
 * Flatten a plan version into the entitlement layer resolution consumes.
 *
 * This is where the three per-meter modes turn into the flat maps the resolver
 * works with, and where the distinction between them has to survive: an
 * `unavailable` meter must NOT land in meterAllowances as a zero, because that
 * reads as "included, none of it" and bills from the first unit.
 */
export function versionEntitlements(
  version: PlanVersion,
): PriceEntitlements & { id: string | null } {
  const meterAllowances: Record<string, number> = {};
  const hardCaps: Record<string, number> = {};
  const meterRates: Record<string, { unit_amount_cents: number; per: number }> =
    {};
  const unavailableMeters: string[] = [];

  for (const term of version.meters) {
    if (term.mode === "unavailable") {
      unavailableMeters.push(term.meter);
      continue;
    }
    // A metered meter includes nothing by definition; an included one includes
    // whatever it declares.
    meterAllowances[term.meter] =
      term.mode === "metered" ? 0 : term.includedQuantity;

    if (term.hardCap != null) hardCaps[term.meter] = term.hardCap;

    // A plan-level re-price. Only a complete pair is honoured: half a rate is a
    // configuration slip, and guessing the other half would invent a price.
    if (term.unitAmountCents != null && term.per != null && term.per > 0) {
      meterRates[term.meter] = {
        unit_amount_cents: term.unitAmountCents,
        per: term.per,
      };
    }
  }

  return {
    id: version.id,
    includedCreditCents: version.includedCreditCents ?? 0,
    meterAllowances,
    hardCaps,
    meterRates,
    unavailableMeters,
    billable: version.billable,
  };
}

/**
 * Everything an org is entitled to, resolved through the plan + its version.
 *
 * The one function every billing surface should call. Callers that already hold
 * the org's plan can pass it to skip a lookup, but the plan is re-read by
 * default because a stale plan resolves the wrong price.
 */
export async function orgEntitlementContext(
  orgId: string,
): Promise<OrgEntitlementContext> {
  const [org] = await db
    .select({
      plan: organizations.plan,
      planVersionId: organizations.planVersionId,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Fail toward the most restrictive plan: an org we cannot resolve is not
  // granted Pro's uncapped terms on the strength of a failed lookup.
  const plan: PlanId = org && isPlanId(org.plan) ? org.plan : "free";

  const version = await versionForOrg({
    plan,
    planVersionId: org?.planVersionId ?? null,
  });

  return {
    plan,
    version,
    entitlements: resolveEntitlements({
      plan,
      price: versionEntitlements(version),
    }),
    price: {
      id: version.id,
      label: version.label,
      unitAmountCents: version.unitAmountCents,
      currency: version.currency,
      interval: version.interval,
      status: version.status,
    },
  };
}

