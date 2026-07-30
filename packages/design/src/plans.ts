/**
 * The plan catalog: the single source of truth for pricing, shared by the
 * marketing pricing page and the in-app create-organization picker so the two
 * can never drift.
 *
 * Hobby is free (one per account). Pro is a paid, Stripe-backed plan ($20/mo,
 * flat) — creating a Pro org routes through Checkout and the org is locked
 * until the subscription is active. Enterprise stays defined-but-unavailable
 * (Contact Sales), never self-serve.
 */
export type PlanId = "hobby" | "pro" | "enterprise";

export type PlanPrice = {
  /** The monthly figure, e.g. "$0", "$20", "Custom". */
  amount: string;
  /** Unit after the figure, e.g. "per month". Omit for Custom pricing. */
  unit?: string;
  /** Makes metering explicit right in the price, Laravel-style: "plus usage".
   *  The fee is a usage credit; you are only billed beyond it. */
  plus?: string;
};

export type PlanFeature = {
  text: string;
  /** A planned capability not yet shipped: rendered muted with a "Soon" tag, so
   *  the roadmap is visible without implying it already works. */
  soon?: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  price: PlanPrice;
  /** A small callout under the price (e.g. Hobby's Pro-only-usage note). */
  note?: string;
  /** Intro line above the feature list, e.g. "Everything in Hobby, plus". */
  featuresLead?: string;
  features: PlanFeature[];
  /** Whether the plan can be chosen right now. */
  available: boolean;
  /** Highlight as the recommended plan (only shown once it is available). */
  popular?: boolean;
  /** Label for the marketing pricing call-to-action. */
  ctaLabel: string;
};

export const PLANS: Plan[] = [
  {
    id: "hobby",
    name: "Hobby",
    description: "For personal projects and trying Flagon out.",
    price: { amount: "$0", unit: "per month" },
    // Be honest: Hobby is not "everything" — it is one user with a free usage
    // allowance, and some usage and features need Pro.
    note: "One user. Usage beyond the free allowance needs Pro.",
    features: [
      { text: "All core products, at hobby scale" },
      { text: "Unlimited projects and environments" },
      { text: "A monthly usage allowance included" },
      { text: "Community support" },
    ],
    available: true,
    ctaLabel: "Start for free",
  },
  {
    id: "pro",
    name: "Pro",
    description: "Everything you need to build and scale with a team.",
    price: { amount: "$20", unit: "per month", plus: "plus usage" },
    // The fee is a usage credit, not a seat charge: it covers usage, and you are
    // only billed more if you go past it.
    note: "The $20 goes toward usage. Pay more only if you exceed it.",
    featuresLead: "All Hobby features, plus:",
    features: [
      { text: "Unlimited team members and roles" },
      { text: "Usage-based pricing, never per-seat" },
      { text: "Higher usage allowance included" },
      { text: "Priority support" },
      { text: "SSO with SAML and SCIM", soon: true },
      { text: "Audit logs", soon: true },
      { text: "7-day log retention", soon: true },
    ],
    available: true,
    popular: true,
    ctaLabel: "Start with Pro",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Critical security, compliance, support, and SLAs.",
    price: { amount: "Custom" },
    note: "Let's find the right fit for your team.",
    featuresLead: "All Pro features, plus:",
    features: [
      { text: "Dedicated support and SLAs" },
      { text: "Custom usage volumes" },
      { text: "Invoicing and procurement" },
      { text: "Security reviews" },
      { text: "Data residency options", soon: true },
    ],
    available: false,
    ctaLabel: "Contact sales",
  },
];

export const DEFAULT_PLAN: PlanId = "hobby";

/** The plans a user can actually choose today. */
export const SELECTABLE_PLANS = PLANS.filter((p) => p.available);

const PLAN_IDS = new Set<string>(PLANS.map((p) => p.id));

export function isPlanId(value: string): value is PlanId {
  return PLAN_IDS.has(value);
}

/** A known plan that can be chosen right now. */
export function isSelectablePlan(value: string): value is PlanId {
  return PLANS.some((p) => p.id === value && p.available);
}

export function planName(id: string): string {
  return PLANS.find((p) => p.id === id)?.name ?? "Hobby";
}

/**
 * Whether a plan can invite additional members. Hobby is a single-user plan
 * (like Sentry's Developer tier); teams need Pro or above. Self-hosting has no
 * user limit and is called out separately (SELF_HOST_NOTE).
 */
export function planAllowsInvites(id: string): boolean {
  return id !== "hobby";
}

/** Shown near the plans: self-hosting is unlimited and separate from the tiers. */
export const SELF_HOST_NOTE =
  "Prefer to self-host? Flagon is source-available and free to run yourself, with no user limit.";
