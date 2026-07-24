import { Check } from "lucide-react";
import { formatCents } from "@/lib/meters";
import { renderFeatures, type PlanCopyContext } from "@/lib/plan-copy";

/**
 * The plan columns, shared by the marketing pricing page and the in-app
 * organization creation flow. One joined panel with internal dividers
 * (Vercel-style), price directly under the plan name, features below a rule,
 * CTA pinned to the bottom. Callers supply the CTA nodes so the pricing story
 * is identical everywhere it appears.
 *
 * RENDERS FROM DATA, NOT CONSTANTS. Plans are rows now (drizzle/0037), so this
 * takes them as a prop instead of importing PLANS. Two consequences worth
 * naming: the column count is whatever is listed rather than hard-coded to
 * three, and an unbilled tier renders as "Free" rather than "$0/mo" - which is
 * what it actually is, and what stopped Hobby reading as a subscription.
 */

export type PlanColumn = {
  /** The version id, which is what `ctas` is keyed by. */
  id: string;
  /** The stable plan id (free/pro/enterprise), for callers that act on it. */
  plan: string;
  displayName: string;
  tagline: string;
  features: string[];
  billable: boolean;
  selfServe: boolean;
  unitAmountCents: number | null;
  interval: string;
  highlight: boolean;
  /** A not-yet-launched plan: renders "Coming soon" instead of a price. */
  comingSoon?: boolean;
  /** Context for {token} substitution in the bullets. */
  copy: PlanCopyContext;
};

/**
 * How a plan's price reads at the top of its column.
 *
 * Genuinely different answers, and collapsing any two of them misleads: a
 * not-yet-launched plan is Coming soon (no price to quote yet), an unbilled
 * tier is Free (not $0, which implies an invoice for nothing), and a real
 * subscription is its amount.
 */
function priceLabel(plan: PlanColumn): { price: string; period?: string } {
  if (plan.comingSoon) return { price: "Coming soon" };
  if (!plan.billable) return { price: "Free" };
  if (plan.unitAmountCents == null) return { price: "Custom" };
  return {
    price: formatCents(plan.unitAmountCents).replace(/\.00$/, ""),
    period: plan.interval === "year" ? "/yr" : "/mo",
  };
}
function Column({
  name,
  popular,
  price,
  period,
  tagline,
  ladderFrom,
  features,
  cta,
  highlight,
}: {
  name: string;
  popular?: boolean;
  price: string;
  period?: string;
  tagline: string;
  ladderFrom?: string;
  features: readonly string[];
  cta?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`flex flex-col p-8 ${highlight ? "bg-white/3" : ""}`}>
      <div className="flex items-center gap-2.5">
        <h3 className="text-sm font-semibold text-zinc-100">{name}</h3>
        {popular ? (
          <span className="rounded border border-teal-500/40 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-teal-300">
            Popular
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        <span className="text-5xl font-semibold tracking-tight text-zinc-100">
          {price}
        </span>
        {period ? (
          <span className="pb-1.5 text-sm text-zinc-500">{period}</span>
        ) : null}
      </div>

      <p className="mt-4 min-h-10 max-w-xs text-sm leading-5 text-zinc-400">
        {tagline}
      </p>

      <div className="mt-6 border-t border-white/10 pt-6">
        {ladderFrom ? (
          <p className="pb-4 text-sm text-zinc-400">
            All {ladderFrom} features, plus:
          </p>
        ) : null}
        <ul className="space-y-3.5">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2.5 text-sm leading-5 text-zinc-300"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
                aria-hidden
              />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {cta ? <div className="mt-10 flex flex-1 items-end">{cta}</div> : null}
    </div>
  );
}

export function PlanColumns({
  plans,
  ctas = {},
  bare = false,
}: {
  /** The listed plan versions, in display order. */
  plans: PlanColumn[];
  /** CTA node per plan id, so each surface supplies its own actions. */
  ctas?: Record<string, React.ReactNode>;
  /**
   * Drop the outer border and background, for callers that already provide
   * them (a BleedBand rules the block itself, and doubling the border would
   * draw two lines a pixel apart).
   */
  bare?: boolean;
}) {
  // Grid tracks follow the data: adding a fourth plan in the console must not
  // silently overflow a hard-coded three-column grid.
  const columns =
    plans.length === 1
      ? "lg:grid-cols-1"
      : plans.length === 2
        ? "lg:grid-cols-2"
        : plans.length === 4
          ? "lg:grid-cols-4"
          : "lg:grid-cols-3";

  return (
    <div
      className={`grid grid-cols-1 divide-y divide-white/10 ${columns} lg:divide-x lg:divide-y-0 ${
        bare ? "" : "border border-white/10 bg-white/2"
      }`}
    >
      {plans.map((plan, index) => {
        const { price, period } = priceLabel(plan);
        return (
          <Column
            key={plan.id}
            name={plan.displayName}
            popular={plan.highlight}
            highlight={plan.highlight}
            price={price}
            period={period}
            tagline={plan.tagline}
            // "All X features, plus:" reads off the previous column, so it
            // stays correct however many plans there are and whatever they are
            // called.
            ladderFrom={index > 0 ? plans[index - 1].displayName : undefined}
            features={renderFeatures(plan.features, plan.copy)}
            cta={ctas[plan.id]}
          />
        );
      })}
    </div>
  );
}
