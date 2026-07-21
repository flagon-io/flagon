/**
 * Discounts: coupons and promotion codes, as the console has to render them.
 *
 * PURE DATA MATH, importable from client components. Stripe is read in
 * billing.ts and mapped into the shape below; nothing here talks to it.
 *
 * NO POLICY IS BAKED IN, deliberately. A discount might be 100% off everything
 * for three months, or a flat $20 off the subscription only with metered usage
 * still billed in full. Both are legitimate and both get issued. So this module
 * applies whatever Stripe was configured with rather than assuming a shape, and
 * every surface renders the discount as its own line instead of folding it into
 * a total, so which case an organization is in is always visible.
 *
 * That visibility matters more than it looks. addUsageToInvoice (billing.ts)
 * attaches metered overage to the SAME invoice a subscription coupon lands on,
 * so an unrestricted percentage discount quietly reduces usage charges too, at
 * whatever volume the customer eventually grows into. Showing the scope makes
 * that a decision instead of a surprise.
 */

/** What a discount is allowed to reduce. */
export type DiscountScope = "all" | "subscription";

export type Discount = {
  id: string;
  /** The coupon's name, or a generated description of what it does. */
  label: string;
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string;
  scope: DiscountScope;
  /** When it stops applying; null when it runs forever or only once. */
  endsAt: Date | null;
  /** "for 3 months", "once", "forever". */
  durationLabel: string;
};

export type DiscountedTotal = {
  /** What the discount takes off, in cents. Never more than the base. */
  discountCents: number;
  /** Base minus discount, floored at zero. */
  totalCents: number;
};

/**
 * Apply a discount to a period's parts.
 *
 * The split matters: a subscription-scoped discount reduces only the recurring
 * fee, so a customer on "$20 off Pro" with $60 of overage pays the overage in
 * full. An unrestricted one reduces the whole invoice. Getting this backwards
 * either overcharges someone who was promised free months or silently gives
 * away metered usage forever.
 */
export function discountedTotal(
  parts: { subscriptionCents: number; usageCents: number },
  discount: Discount | null,
): DiscountedTotal {
  const subscription = Math.max(parts.subscriptionCents, 0);
  const usage = Math.max(parts.usageCents, 0);
  const base = subscription + usage;

  if (!discount) return { discountCents: 0, totalCents: base };

  // What the discount is allowed to touch.
  const eligible = discount.scope === "subscription" ? subscription : base;

  let discountCents = 0;
  if (discount.percentOff !== null) {
    // Round rather than floor: Stripe rounds percentage discounts to the
    // nearest cent, and a page that consistently rounded the other way would
    // disagree with the invoice by a cent on a lot of accounts.
    discountCents = Math.round((eligible * discount.percentOff) / 100);
  } else if (discount.amountOffCents !== null) {
    discountCents = discount.amountOffCents;
  }

  // A discount can zero a bill; it can never create a credit.
  discountCents = Math.min(Math.max(discountCents, 0), eligible);

  return { discountCents, totalCents: base - discountCents };
}

/**
 * Whether a discount reaches metered usage. The one thing worth saying out
 * loud on a page that shows both a subscription and an overage line.
 */
export function coversUsage(discount: Discount | null): boolean {
  return discount?.scope === "all";
}

/** "50% off", "$20 off" - what the coupon does, when it has no name. */
export function describeDiscount(input: {
  percentOff: number | null;
  amountOffCents: number | null;
  currency: string;
}): string {
  if (input.percentOff !== null) {
    return `${formatPercent(input.percentOff)} off`;
  }
  if (input.amountOffCents !== null) {
    const amount = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: input.currency.toUpperCase(),
      minimumFractionDigits: input.amountOffCents % 100 === 0 ? 0 : 2,
    }).format(input.amountOffCents / 100);
    return `${amount} off`;
  }
  return "Discount";
}

/** 50 -> "50%", 33.33 -> "33.33%". Stripe allows fractional percentages. */
function formatPercent(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/**
 * "for 3 months" / "once" / "forever", from Stripe's coupon duration.
 *
 * Phrased as a modifier so it reads after the discount itself: "100% off for
 * 3 months". A customer who cannot tell a permanent discount from a trial one
 * finds out the hard way, on the first invoice that charges full price.
 */
export function durationLabelFor(
  duration: "once" | "repeating" | "forever" | string,
  months: number | null,
): string {
  if (duration === "repeating" && months && months > 0) {
    return months === 1 ? "for 1 month" : `for ${months} months`;
  }
  if (duration === "once") return "once";
  if (duration === "forever") return "forever";
  return "";
}
