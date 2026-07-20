import { Check } from "lucide-react";
import { PLANS } from "@/lib/plans";

/**
 * The three plan columns, shared by the marketing pricing page and the
 * in-app organization creation flow. One joined panel with internal
 * dividers (Vercel-style), price directly under the plan name, features
 * below a rule, CTA pinned to the bottom. Callers supply the CTA nodes so
 * the pricing story is identical everywhere it appears.
 */
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
    <div
      className={`flex flex-col p-8 ${highlight ? "bg-white/3" : ""}`}
    >
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
  freeCta,
  proCta,
  enterpriseCta,
}: {
  freeCta?: React.ReactNode;
  proCta?: React.ReactNode;
  enterpriseCta?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 divide-y divide-white/10 border border-white/10 bg-white/2 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
      <Column
        name={PLANS.free.name}
        price="$0"
        period="/mo"
        tagline={PLANS.free.tagline}
        features={PLANS.free.features}
        cta={freeCta}
      />
      <Column
        name={PLANS.pro.name}
        popular
        highlight
        price={`$${PLANS.pro.priceMonthly}`}
        period="/mo"
        tagline={PLANS.pro.tagline}
        ladderFrom={PLANS.free.name}
        features={PLANS.pro.features}
        cta={proCta}
      />
      <Column
        name={PLANS.enterprise.name}
        price="Custom"
        tagline={PLANS.enterprise.tagline}
        ladderFrom={PLANS.pro.name}
        features={PLANS.enterprise.features}
        cta={enterpriseCta}
      />
    </div>
  );
}
