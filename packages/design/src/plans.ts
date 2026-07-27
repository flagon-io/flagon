/**
 * The plan catalog: the single source of truth for pricing, shared by the
 * marketing pricing page and the in-app create-organization picker so the two
 * can never drift.
 *
 * Alpha state: ONLY Hobby is `available` (free, and unmetered while we are in
 * alpha). Pro and Enterprise are defined and shown so the roadmap is visible,
 * but are not selectable ("coming soon") and cannot be chosen until real billing
 * exists. Pro's future price ($20/mo, flat, usage-based, never per-seat) is
 * mocked in here.
 */
export type PlanId = "hobby" | "pro" | "enterprise";

export type PlanPrice = {
  /** The headline figure, e.g. "Free", "$20", "Custom". */
  amount: string;
  /** Optional unit after the figure, e.g. "/mo". */
  suffix?: string;
};

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  price: PlanPrice;
  /** A small callout under the price, e.g. the alpha note. */
  note?: string;
  /** Intro line above the feature list, e.g. "Everything in Hobby, plus". */
  featuresLead?: string;
  features: string[];
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
    description: "The perfect starting place for personal projects.",
    price: { amount: "$0", suffix: "/mo" },
    note: "Limited to 1 user",
    features: [
      "All core products",
      "Unlimited projects and environments",
      "Community support",
    ],
    available: true,
    ctaLabel: "Create a free organization",
  },
  {
    id: "pro",
    name: "Pro",
    description: "Everything you need to build and scale with a team.",
    price: { amount: "$20", suffix: "/mo" },
    note: "$20/mo, all of it usage credit",
    featuresLead: "All Hobby features, plus:",
    features: [
      "Unlimited team members and roles",
      "SSO with SAML and SCIM",
      "Audit logs",
      "Usage-based pricing, never per-seat",
      "Priority support",
    ],
    available: false,
    popular: true,
    ctaLabel: "Coming soon",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Critical security, compliance, support, and SLAs.",
    price: { amount: "Custom" },
    note: "Let's talk and see how we can serve you best.",
    featuresLead: "All Pro features, plus:",
    features: [
      "Dedicated support and SLAs",
      "Data residency options",
      "Custom usage volumes",
      "Invoicing and procurement",
      "Security reviews",
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
