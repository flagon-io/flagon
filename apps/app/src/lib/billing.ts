/**
 * Pure plan-entitlement logic for the CONSOLE.
 *
 * All Stripe business logic (checkout, portal, webhook, subscription sync) lives
 * in the API now — the console owns no billing writes. What stays here is the
 * pure read-side rule the console needs to gate its own UI: whether an org is
 * locked. It reads the console's own DB (getMembershipBySlug carries the
 * columns) and calls the API for the actual checkout/portal actions.
 *
 * MUST stay in sync with the API's copy in apps/api/src/lib/entitlement.ts.
 */

// Stripe subscription statuses that keep a Pro org usable. `past_due` is the
// dunning grace window: access continues while Stripe retries the card.
const ENTITLING_STATUSES = new Set(["active", "trialing", "past_due"]);

/** Whether a Stripe subscription status grants the Pro plan. */
export function statusEntitlesPro(status: string | null | undefined): boolean {
  return Boolean(status && ENTITLING_STATUSES.has(status));
}

/**
 * Whether an org is LOCKED: on Pro but without an entitling subscription.
 *
 * A lapsed/canceled Pro org is NOT downgraded to a usable free Hobby (that would
 * let anyone farm free orgs past the one-Hobby limit) — it stays on Pro and is
 * locked until reactivated. `subscription_status === null` is the carve-out for
 * comped/grandfathered orgs (manually onboarded, or predating billing).
 */
export function isOrgLocked(org: {
  plan: string;
  subscriptionStatus: string | null;
}): boolean {
  if (org.plan !== "pro") return false;
  if (org.subscriptionStatus === null) return false;
  return !statusEntitlesPro(org.subscriptionStatus);
}
