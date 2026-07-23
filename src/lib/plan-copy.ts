import { formatCents, formatQuantity } from "./meters";

/**
 * Marketing copy that cannot go stale.
 *
 * A feature bullet that says "$20 of included usage" is a copy of a number that
 * lives somewhere else, and the moment pricing moves it is a lie printed on the
 * pricing page. That is not hypothetical - it is what the constants did, and it
 * is why the copy now lives on the same row as the numbers.
 *
 * Living on the same row is necessary but not sufficient: an operator who
 * changes Pro's credit still has to remember to edit the bullet. So a bullet may
 * contain {tokens} that are substituted from the plan itself at render time:
 *
 *   "{credit} of included usage, pooled across every product"
 *   "{flags.evaluations.included} flag evaluations a month"
 *   "{projects} projects"
 *
 * Now the number cannot disagree with the plan, because it IS the plan. Plain
 * text still works, so nobody is forced to learn this to write a bullet.
 *
 * PURE, importable from client components: the pricing page, the in-app plan
 * selector, and the operator console's preview all render bullets identically.
 */

export type PlanCopyContext = {
  includedCreditCents: number | null;
  unitAmountCents: number | null;
  interval: string;
  maxProjects: number | null;
  maxMembers: number | null;
  maxFreeOrgs: number | null;
  /** Per meter: what the plan includes and what it caps. */
  meters: {
    meter: string;
    mode: "included" | "metered" | "unavailable";
    includedQuantity: number;
    hardCap: number | null;
  }[];
};

/** "Unlimited" reads better than an em dash where a number would go. */
function limit(value: number | null): string {
  return value == null ? "Unlimited" : value.toLocaleString("en-US");
}

/**
 * Resolve one token, or null when it means nothing for this plan.
 *
 * Returning null rather than an empty string matters: an unresolvable token is
 * left VISIBLE in the output, so a typo shows up as `{creditt}` on a preview
 * rather than silently deleting the number from a sentence and shipping
 * "  of included usage".
 */
function tokenValue(token: string, context: PlanCopyContext): string | null {
  switch (token) {
    case "credit":
      return context.includedCreditCents != null
        ? formatCents(context.includedCreditCents)
        : null;
    case "price":
      return context.unitAmountCents != null
        ? formatCents(context.unitAmountCents)
        : null;
    case "interval":
      return context.interval;
    case "projects":
      return limit(context.maxProjects);
    case "members":
      return limit(context.maxMembers);
    case "orgs":
      return limit(context.maxFreeOrgs);
    default:
      break;
  }

  // Per-meter tokens: {<meter id>.included} and {<meter id>.cap}.
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const meterId = token.slice(0, dot);
  const field = token.slice(dot + 1);
  const term = context.meters.find((entry) => entry.meter === meterId);
  if (!term) return null;

  if (field === "included") {
    return term.mode === "unavailable"
      ? null
      : formatQuantity(term.includedQuantity);
  }
  if (field === "cap") {
    return term.hardCap != null ? formatQuantity(term.hardCap) : null;
  }
  return null;
}

const TOKEN = /\{([a-zA-Z0-9_.]+)\}/g;

/** Substitute {tokens} in one line of copy. */
export function renderCopy(text: string, context: PlanCopyContext): string {
  return text.replace(TOKEN, (whole, token: string) => {
    const value = tokenValue(token, context);
    return value ?? whole;
  });
}

/** Substitute across a plan's feature bullets. */
export function renderFeatures(
  features: string[],
  context: PlanCopyContext,
): string[] {
  return features.map((feature) => renderCopy(feature, context));
}

/**
 * Tokens that did not resolve, for the console's editor.
 *
 * The operator writing the copy is the only person who can fix a typo, and the
 * only moment they can is while they are writing it - so the editor lists these
 * rather than waiting for someone to notice `{creditt}` on the live site.
 */
export function unresolvedTokens(
  features: string[],
  context: PlanCopyContext,
): string[] {
  const missing = new Set<string>();
  for (const feature of features) {
    for (const match of feature.matchAll(TOKEN)) {
      if (tokenValue(match[1], context) === null) missing.add(match[1]);
    }
  }
  return [...missing];
}

/** The tokens available, for the editor's help text. */
export const COPY_TOKENS = [
  { token: "{price}", describes: "The plan's price" },
  { token: "{credit}", describes: "Included usage credit" },
  { token: "{interval}", describes: "month or year" },
  { token: "{projects}", describes: "Project limit, or Unlimited" },
  { token: "{members}", describes: "Member limit, or Unlimited" },
  { token: "{orgs}", describes: "Free-org limit, or Unlimited" },
  {
    token: "{<meter>.included}",
    describes: "Included quantity, e.g. {flags.evaluations.included}",
  },
  {
    token: "{<meter>.cap}",
    describes: "Hard ceiling, e.g. {flags.syncs.cap}",
  },
];
