/**
 * Plan definitions - PURE DATA, importable from client components (the plan
 * selector renders from it). Database-backed plan queries live in
 * plans.server.ts. The organization is the billing entity; its plan decides
 * entitlements. Numbers live here as named constants so tuning pricing knobs
 * never touches logic.
 *
 * Free is a usage-boxed trial / hobby tier, deliberately not sized for real
 * projects: one free org per account, solo, few projects. Pro is the
 * preferred plan: $20/mo which returns as $20 of usage credit, with overage
 * billed at the same rates. Enterprise is contract-only (no self-serve).
 * When billing is disabled (self-host), none of these limits apply.
 */
export const PLAN_IDS = ["free", "pro", "enterprise"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLANS = {
  // NOTE: the id "free" is the stable identifier (database plan column,
  // API enum); "Hobby" is its display name. Renaming the id would be a data
  // migration - renaming the display is free.
  free: {
    id: "free",
    name: "Hobby",
    priceMonthly: 0,
    tagline: "The perfect starting place for a personal project.",
    limits: {
      /** Hobby orgs a single account may OWN. */
      freeOrgsPerUser: 1,
      projects: 2,
      members: 1,
    },
    features: [
      "1 Hobby organization per account",
      "2 projects",
      "Solo workspace (just you)",
      "Included trial usage",
      "Community support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 20,
    tagline: "Everything you need to ship with your team.",
    limits: {
      freeOrgsPerUser: Infinity,
      projects: Infinity,
      members: Infinity,
    },
    features: [
      "$20 of included usage credit",
      "Team collaboration, no seat pricing",
      "Unlimited projects",
      "Usage-based beyond your credit",
      "Standard support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    /** Custom pricing: fixed from usage estimates, negotiated. No anchor. */
    priceMonthly: null,
    tagline:
      "Critical scale, security, and support, priced from your usage estimates.",
    limits: {
      freeOrgsPerUser: Infinity,
      projects: Infinity,
      members: Infinity,
    },
    features: [
      "Fixed pricing from usage estimates",
      "No hard caps, ever",
      "Uptime SLA",
      "Priority support and onboarding",
      "Invoicing and procurement-friendly terms",
    ],
  },
} as const;

/** Plans a user can pick at creation; enterprise is contact-only. */
export const SELF_SERVE_PLANS: PlanId[] = ["free", "pro"];

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}
