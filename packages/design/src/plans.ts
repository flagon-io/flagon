/**
 * The plan catalog: the single source of truth for pricing, shared by the
 * marketing pricing page and the in-app create-organization picker so the two
 * can never drift.
 *
 * Hobby is free (one per account). Pro is a paid, Stripe-backed plan ($50/mo,
 * flat) — creating a Pro org routes through Checkout and the org is locked
 * until the subscription is active. Enterprise stays defined-but-unavailable
 * (it takes shape after early access), never self-serve.
 *
 * Pricing model (Vercel-shaped): flag & config checks are free and unlimited on every
 * plan (the wedge); the billable meter is analytics EVENTS (exposures + experiment goal
 * events, and more products to come) at $0.03/1K. Hobby is a hard CAP: 500K events/mo
 * free, then sending stops (upgrade, never billed). Pro's price is $50/mo and INCLUDES
 * ~1.67M events across every product; overage bills at EVENT_OVERAGE_PER_MILLION_CENTS
 * ($0.03/1K). The $50 base IS the usage credit — it covers exactly $50 of events (~1.67M
 * at the rate), dollar-for-dollar with no subsidy; past that you pay the same rate. The
 * rate sits just under the big platforms' so Flagon's bill stays at or below theirs at
 * every volume (and the $50 entry is a third of their base). Enterprise trues up against
 * a contracted envelope.
 */
export type PlanId = "hobby" | "pro" | "enterprise";

export type PlanPrice = {
  /** The monthly figure, e.g. "$0", "$50", "Custom". */
  amount: string;
  /** Unit after the figure, e.g. "per month". Omit for Custom pricing. */
  unit?: string;
  /** Makes metering explicit right in the price, Laravel-style: "plus usage".
   *  The fee is the plan; you are only billed for events beyond what it includes. */
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
  /**
   * The flat monthly subscription fee, in cents (the "Subscription License" line
   * on the usage invoice). Pro is $50; Hobby is free; Enterprise is contracted.
   */
  baseCents: number;
  /**
   * The monthly included exposures a plan covers before overage. Hobby 500K is the
   * hard free cap; Pro ~1.67M is CREDIT-DERIVED ($50 credit ÷ $0.03/1K). Drives the usage
   * page's credit-drawdown bar. A pricing lever — change it here and the console
   * reprices. Enterprise is 0 (contracted volumes, shown as usage against a term
   * envelope, not an allowance).
   */
  includedEvents: number;
  /**
   * What happens once `includedEvents` is used up in a month:
   * - "cap": a hard free-tier ceiling. Sending stops there; NEVER charged past it.
   *   The way past it is to upgrade, not to pay overage. (Hobby.)
   * - "bill": overage is metered and billed at EVENT_OVERAGE_PER_MILLION_CENTS. (Pro.)
   * - "contract": trued up against a negotiated envelope, never an automatic
   *   charge. (Enterprise.)
   * This is the switch that keeps the free tier honest: a Hobby user is never
   * surprised by a bill, they are simply asked to upgrade for more.
   */
  overage: "cap" | "bill" | "contract";
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
    baseCents: 0,
    includedEvents: 500_000,
    overage: "cap",
    // Be honest: Hobby is not "everything" — it is one user with a free monthly
    // event ceiling, and teams and higher volume need Pro. It is never billed.
    note: "One user. More usage and team members need Pro.",
    features: [
      { text: "All core products, at hobby scale" },
      { text: "Unlimited reads and checks, always free" },
      { text: "A free monthly usage allowance, across every product" },
      { text: "Community support" },
    ],
    available: true,
    ctaLabel: "Start for free",
  },
  {
    id: "pro",
    name: "Pro",
    description: "Everything you need to build and scale with a team.",
    price: { amount: "$50", unit: "per month", plus: "plus usage" },
    baseCents: 5000,
    includedEvents: 1_666_667,
    overage: "bill",
    // The $50 base IS the usage credit: it covers exactly $50 of events — ~1.67M at the
    // $0.03/1K rate — dollar-for-dollar, no subsidy. Past that you pay the same rate. The
    // rate sits just under the big platforms' so the bill stays at/under theirs at every
    // volume, while the $50 entry is a third of their base. Pay $50 until you pass ~1.7M.
    note: "$50/mo, and it includes your monthly usage across every product. You only pay more if you go beyond it.",
    featuresLead: "All Hobby features, plus:",
    features: [
      { text: "Unlimited team members and roles" },
      { text: "Monthly usage included, across every product" },
      { text: "Usage-based pricing, never per-seat" },
      { text: "Priority support" },
      { text: "SSO with SAML & OIDC, SCIM, and enforced 2FA" },
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
    description: "For teams with needs beyond Pro.",
    price: { amount: "Custom" },
    baseCents: 0,
    includedEvents: 0,
    overage: "contract",
    // Everything below is HYPOTHETICAL — ideas we might explore, NOT commitments and
    // NOT on the roadmap. Enterprise is only defined once Flagon leaves early access,
    // so nothing here can harden into a broken promise. Keep it lean, don't overinflate,
    // and don't list anything already on Pro (SSO/SCIM/audit are Pro features).
    note: "Ideas we might explore, not promises. Nothing here is committed or scheduled until Flagon is out of early access.",
    featuresLead: "Directions we may explore later:",
    features: [
      { text: "Priority support with SLAs", soon: true },
      { text: "Custom volumes and committed-use pricing", soon: true },
      { text: "Invoicing and net terms", soon: true },
      { text: "Security reviews and a DPA", soon: true },
      { text: "Guided onboarding and migration", soon: true },
      { text: "Self-hosted deployment support", soon: true },
    ],
    available: false,
    ctaLabel: "After early access",
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

/** The monthly included events allowance for a plan; 0 for unknown/contracted. */
export function planIncludedEvents(id: string): number {
  return PLANS.find((p) => p.id === id)?.includedEvents ?? 0;
}

/**
 * How a plan treats usage past its included allowance: "cap" (free-tier ceiling,
 * never billed), "bill" (metered overage), or "contract" (envelope true-up).
 * Unknown plans default to "cap" — fail safe, never surprise-bill.
 */
export function planOverage(id: string): "cap" | "bill" | "contract" {
  return PLANS.find((p) => p.id === id)?.overage ?? "cap";
}

/**
 * Overage rate for analytics exposures beyond a plan's included allowance, in cents
 * per 1,000,000 exposures ($0.03/1K = $30/1M = 3000). MIRRORS the meter registry's
 * events rate in the API (apps/api/src/usage/meters.ts) — the API is the source of
 * truth for billing; this copy is for marketing/pricing surfaces that can't import
 * it. Keep the two in sync.
 */
export const EVENT_OVERAGE_PER_MILLION_CENTS = 3000;

/**
 * The feature bullets to render for a plan. For a usage-billed plan (Pro) this injects
 * an overage bullet right after the "usage included" line, so the scaling reads as part
 * of the list rather than sitting in the price heading. We deliberately do NOT publish a
 * specific per-event RATE or an included-events count on any pre-purchase surface (both
 * move as we tune pricing; the live rate + allowance are shown on the app usage page for
 * a customer's ACTUAL bill). Keeping the public copy rate-free avoids promising a number
 * before it is locked. Both the pricing table and the create-org picker render this.
 */
export function planFeatures(plan: Plan): PlanFeature[] {
  if (plan.overage !== "bill") return plan.features;
  const overage: PlanFeature = {
    text: "Then billed for events past your included usage",
  };
  const at = plan.features.findIndex((f) => /usage included/i.test(f.text));
  return at === -1
    ? [...plan.features, overage]
    : [
        ...plan.features.slice(0, at + 1),
        overage,
        ...plan.features.slice(at + 1),
      ];
}

/**
 * The Pro plan's monthly usage credit, in cents ($50) — equal to the base fee, which
 * at $0.03/1K covers Pro's ~1.67M included events. The base fee IS the credit: $50 in,
 * $50 of events out. MIRRORS the API's PRO_CREDIT_CENTS (apps/api/src/lib/plans.ts),
 * the source of truth that actually grants the credit. Display uses `includedEvents`
 * (~1.67M), not this number.
 */
export const PRO_CREDIT_CENTS = 5000;

/** The monthly usage credit (cents) for a plan; 0 for free/contracted. */
export function planCreditCents(id: string): number {
  return id === "pro" ? PRO_CREDIT_CENTS : 0;
}

/** The flat monthly subscription fee (cents) for a plan; 0 for free/contracted. */
export function planBaseCents(id: string): number {
  return PLANS.find((p) => p.id === id)?.baseCents ?? 0;
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
