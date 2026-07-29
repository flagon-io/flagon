/**
 * Pure plan-entitlement logic, shared by the billing service (which writes it)
 * and org-context (which enforces it). Dependency-free on purpose: no Stripe, no
 * database — just the rules that turn a subscription status into access.
 *
 * MUST stay in sync with the console's copy in apps/app/src/lib/billing.ts (the
 * console reads its own DB to gate the workspace UI; this copy gates the API).
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
 * comped/grandfathered orgs (manually onboarded, or predating billing): they
 * have no Stripe status and are never locked.
 */
export function isOrgLocked(org: {
  plan: string;
  subscriptionStatus: string | null;
}): boolean {
  if (org.plan !== "pro") return false;
  if (org.subscriptionStatus === null) return false;
  return !statusEntitlesPro(org.subscriptionStatus);
}
