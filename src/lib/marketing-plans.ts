import type { PlanColumn } from "@/components/plan-columns";

/**
 * The marketing plan columns, as STATIC copy.
 *
 * The public pricing story - which plans exist, their names, taglines, feature
 * bullets, and order - is marketing, not billing data, so it lives here as code
 * rather than being derived from the plan_versions catalog. That keeps the
 * public pages fast and decoupled: they never depend on the billing schema to
 * render the right set of plans.
 *
 * The ONE thing that must stay true to what we actually charge is the Pro
 * price (and its included credit). Those are injected live from the active Pro
 * plan version (see proHeadline() in plan-catalog.server.ts) via the {price} /
 * {credit} tokens, so the number on the site can never drift from the bill.
 * Hobby's numbers are fixed copy (Hobby is never repriced); Enterprise is a
 * "coming soon" card with no price at all.
 */

export type ProHeadline = {
  /** The active Pro version's price, in cents. */
  priceCents: number;
  interval: string;
  /** The active Pro version's included usage credit, in cents. */
  includedCreditCents: number;
};

/** Build the three marketing columns, injecting the live Pro price/credit. */
export function marketingColumns(pro: ProHeadline): PlanColumn[] {
  return [
    {
      id: "free",
      plan: "free",
      displayName: "Hobby",
      tagline: "The perfect starting place for a personal project.",
      features: [
        "1 Hobby organization per account",
        "2 projects",
        "Solo workspace (just you)",
        "Unlimited flags",
        "$10 of included usage a month, pooled across products",
        "Never generates a bill",
        "Or self-host the open-source version, free forever",
        "Community support",
      ],
      billable: false,
      selfServe: true,
      unitAmountCents: null,
      interval: "month",
      highlight: false,
      copy: EMPTY_COPY,
    },
    {
      id: "pro",
      plan: "pro",
      displayName: "Pro",
      tagline: "Everything you need to ship with your team.",
      features: [
        "{credit} of included usage, pooled across every product",
        "Team collaboration, no seat pricing",
        "Unlimited projects",
        "Usage-based beyond your credit, no hard cap",
        "Standard support",
      ],
      billable: true,
      selfServe: true,
      unitAmountCents: pro.priceCents,
      interval: pro.interval,
      highlight: true,
      // Live: {price}/{credit} resolve from the active Pro version.
      copy: {
        includedCreditCents: pro.includedCreditCents,
        unitAmountCents: pro.priceCents,
        interval: pro.interval,
        maxProjects: null,
        maxMembers: null,
        maxFreeOrgs: null,
        meters: [],
      },
    },
    {
      id: "enterprise",
      plan: "enterprise",
      displayName: "Enterprise",
      tagline: "Critical scale, security, and support — coming soon.",
      features: [
        "Everything in Pro",
        "Fixed pricing from your usage estimates",
        "No hard caps, ever",
        "Uptime SLA and security review",
        "Priority support and onboarding",
        "Invoicing and procurement-friendly terms",
      ],
      billable: false,
      selfServe: false,
      comingSoon: true,
      unitAmountCents: null,
      interval: "month",
      highlight: false,
      copy: EMPTY_COPY,
    },
  ];
}

/** No tokens to resolve: plain-text bullets render unchanged through renderFeatures. */
const EMPTY_COPY: PlanColumn["copy"] = {
  includedCreditCents: null,
  unitAmountCents: null,
  interval: "month",
  maxProjects: null,
  maxMembers: null,
  maxFreeOrgs: null,
  meters: [],
};
