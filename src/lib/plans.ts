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
    /**
     * Usage the plan absorbs each period, in cents (src/lib/meters.ts). Hobby
     * isn't invoiced at all, so this documents the trial allowance rather than
     * a credit against a bill, and it is also what SIZES the hard cap
     * (src/lib/quota.ts).
     *
     * The credit is POOLED across every product, not allocated per product. At
     * today's flag rate $10.00 happens to buy 10M evaluations, but that is an
     * example of what the credit is worth, NOT an entitlement to that many of
     * that one thing. Never advertise it as a per-product quantity: the moment
     * a second meter ships, that number stops being true.
     *
     * Hobby's job is to be obviously sufficient for a side project and
     * obviously insufficient for a company. The constraints that do that work
     * are seats and projects below; the evaluation ceiling is only there so
     * the tier can never become a way to run production for nothing.
     */
    includedUsageCents: 1000,
    /**
     * Units of a meter this plan gets before PRICING starts, overriding the
     * meter's own included quantity. Only for meters whose allowance is a
     * plan-level guardrail rather than something the usage credit buys.
     */
    meterAllowances: { "flags.syncs": 5_000_000 },
    /**
     * Units of a meter this plan may consume before requests are REFUSED.
     *
     * Distinct from meterAllowances: that one decides what is free, this one
     * decides what is possible. Only Hobby has entries, because only Hobby is
     * hard-capped. flags.evaluations is absent here because its ceiling is
     * derived from the usage credit (src/lib/quota.ts) rather than declared.
     *
     * 5M syncs is roughly $1.80 of bandwidth: enough for a side project's SDK
     * to poll all month, far short of the always-on fleet the guardrail is
     * there to stop from running free.
     */
    hardCaps: { "flags.syncs": 5_000_000 },
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
      "Unlimited flags",
      "$10 of included usage a month, pooled across products",
      "Never generates a bill",
      "Community support",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 20,
    /**
     * The $20 comes back as $20 of usage before anything is billed on top,
     * POOLED across every product rather than allocated per product. What it
     * buys therefore depends on what you use it for; quoting it as a quantity
     * of any single meter would stop being true the moment a second product
     * shipped. Pro is never hard-capped: past the credit it bills, it does
     * not refuse.
     */
    includedUsageCents: 2000,
    /** 50M syncs covers roughly 575 always-on instances; billed beyond, never refused. */
    meterAllowances: { "flags.syncs": 50_000_000 },
    /** Pro is never hard-capped: past the allowance it bills, it does not refuse. */
    hardCaps: {},
    tagline: "Everything you need to ship with your team.",
    limits: {
      freeOrgsPerUser: Infinity,
      projects: Infinity,
      members: Infinity,
    },
    features: [
      "$20 of included usage, pooled across every product",
      "Team collaboration, no seat pricing",
      "Unlimited projects",
      "Usage-based beyond your credit, no hard cap",
      "Standard support",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    /** Custom pricing: fixed from usage estimates, negotiated. No anchor. */
    priceMonthly: null,
    /** Contracted per agreement; usage is reviewed, never cut off. */
    includedUsageCents: 0,
    /** Contracted per agreement rather than declared here. */
    meterAllowances: {},
    hardCaps: {},
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
