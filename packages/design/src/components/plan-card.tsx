import type { KeyboardEvent, ReactNode } from "react";
import { planFeatures, type Plan } from "../plans";

/**
 * A Vercel-style plan column, shared by the marketing pricing page and the
 * in-app create-organization picker.
 *
 * Layout is one tall column: name + badge, a big price, a short description, a
 * thin rule, the feature list, and a CTA pinned to the bottom (so CTAs line up
 * across columns of uneven length).
 *
 * Two container modes:
 *   - Pricing page: `bordered={false}` (the default). The card draws no border of
 *     its own; the page joins the columns inside one bordered box with dividers,
 *     and `highlighted` gives the popular column a subtle tint.
 *   - Create-org picker: `bordered` + `onSelect` (+ `selected`). Each card is its
 *     own selectable radio, bordered and highlighting when chosen.
 *
 * Unavailable plans (alpha: Pro, Enterprise) render dimmed with a "Coming soon"
 * pill and cannot be selected. The "Popular" pill shows only once a popular plan
 * is actually available, so nothing paid is promoted before launch.
 *
 * A plan that IS available but blocked for this account (e.g. Hobby once you
 * already have one) is passed `disabled` with a `disabledLabel` pill and a
 * `disabledNote` shown as a banner on the card, so the reason is right there on
 * the card rather than a footnote elsewhere.
 */
export function PlanCard({
  plan,
  selected = false,
  onSelect,
  bordered = false,
  highlighted = false,
  cta,
  className,
  disabled = false,
  disabledLabel,
  disabledNote,
}: {
  plan: Plan;
  selected?: boolean;
  onSelect?: () => void;
  bordered?: boolean;
  highlighted?: boolean;
  cta?: ReactNode;
  className?: string;
  disabled?: boolean;
  disabledLabel?: string;
  disabledNote?: ReactNode;
}) {
  const blocked = disabled || !plan.available;
  const selectable = Boolean(onSelect) && !blocked;
  const showPopular = Boolean(plan.popular) && plan.available && !disabled;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!selectable) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.();
    }
  }

  const interactive = selectable
    ? {
        role: "radio" as const,
        "aria-checked": selected,
        tabIndex: 0,
        onClick: onSelect,
        onKeyDown,
      }
    : {};

  const surface = bordered
    ? selected
      ? "rounded-xl border border-teal-500/60 bg-teal-500/5"
      : selectable
        ? "rounded-xl border border-white/10 cursor-pointer hover:border-white/25"
        : "rounded-xl border border-white/10"
    : highlighted
      ? "bg-white/2"
      : "";

  return (
    <div
      {...interactive}
      className={[
        "flex h-full flex-col p-6",
        surface,
        selectable
          ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
          : "",
        blocked ? "opacity-60" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Name + status pill */}
      <div className="gap-2 flex items-center">
        {onSelect ? (
          <span
            aria-hidden
            className={`h-4 w-4 grid shrink-0 place-items-center rounded-full border ${
              selected ? "border-teal-400" : "border-white/25"
            }`}
          >
            {selected ? (
              <span className="h-2 w-2 bg-teal-400 rounded-full" />
            ) : null}
          </span>
        ) : null}
        <span className="text-sm font-medium text-zinc-200">{plan.name}</span>
        {showPopular ? <Pill accent>Popular</Pill> : null}
        {!plan.available ? (
          <Pill>Coming soon</Pill>
        ) : disabled && disabledLabel ? (
          <Pill>{disabledLabel}</Pill>
        ) : null}
      </div>

      {/* Price. "plus usage" sits right in the price so metering is never a
          surprise; the annual note appears only on the annual interval. */}
      <div className="mt-5 gap-x-1.5 flex flex-wrap items-baseline">
        <span className="text-4xl font-semibold tracking-tight text-zinc-100">
          {plan.price.amount}
        </span>
        {plan.price.unit ? (
          <span className="text-sm text-zinc-500">{plan.price.unit}</span>
        ) : null}
        {plan.price.plus ? (
          <span className="text-sm font-medium text-zinc-400">{plan.price.plus}</span>
        ) : null}
      </div>
      {plan.note ? (
        <p className="mt-1.5 text-xs leading-5 text-zinc-500">{plan.note}</p>
      ) : null}

      {/* Description */}
      <p className="mt-3 text-sm leading-6 text-zinc-400">{plan.description}</p>

      {/* Features */}
      <div className="mt-6 border-white/8 pt-5 border-t">
        {plan.featuresLead ? (
          <p className="mb-3 text-xs text-zinc-400">{plan.featuresLead}</p>
        ) : null}
        <ul className="gap-2.5 flex flex-col">
          {planFeatures(plan).map((feature) => (
            <li
              key={feature.text}
              className={`gap-2.5 text-sm flex items-start ${
                feature.soon ? "text-zinc-500" : "text-zinc-300"
              }`}
            >
              <CheckIcon dim={feature.soon} />
              <span className="flex-1">{feature.text}</span>
              {feature.soon ? <SoonTag /> : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Pinned to the bottom so columns align: the CTA, or (when the card is
          blocked for this account) a banner spelling out why. */}
      {disabled && disabledNote ? (
        <div className="pt-6 mt-auto">
          <div className="rounded-md border-white/10 bg-white/4 px-3 py-2.5 text-xs leading-5 text-zinc-400 border">
            {disabledNote}
          </div>
        </div>
      ) : cta ? (
        <div className="pt-6 mt-auto">{cta}</div>
      ) : null}
    </div>
  );
}

function Pill({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 font-medium tracking-wide border text-[10px] uppercase ${
        accent
          ? "border-teal-500/40 text-teal-300"
          : "border-white/15 text-zinc-400"
      }`}
    >
      {children}
    </span>
  );
}

function CheckIcon({ dim = false }: { dim?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      className={`mt-0.5 shrink-0 ${dim ? "text-zinc-600" : "text-teal-400/80"}`}
      aria-hidden
      focusable="false"
    >
      <path
        d="M13.5 4.5L6.5 11.5L3 8"
        stroke="currentColor"
        strokeWidth="1.75"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Marks a feature that is on the roadmap but not shipped yet. */
function SoonTag() {
  return (
    <span className="rounded border-white/12 px-1 font-medium tracking-wide text-zinc-500 shrink-0 self-center border py-px text-[9px] leading-none uppercase">
      Soon
    </span>
  );
}
