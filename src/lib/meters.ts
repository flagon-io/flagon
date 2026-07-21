/**
 * The meter registry: what the platform charges for, and at what rate.
 *
 * PURE DATA, importable anywhere (the usage page and the invoice builder
 * both render from it). Every product declares its meters here and nothing
 * else needs to change: usage rows are keyed by meter id, the usage page
 * groups by product or project, and Stripe invoices get one line per meter
 * that was actually used.
 *
 * EVERY METER IS CHARGEABLE. There is no "measured but free" tier: something
 * the platform does not intend to charge for does not belong in the registry,
 * because listing it teaches customers to read a price of zero as a promise.
 * A product whose price isn't decided yet stays out until it is.
 *
 * Adding a product: add its entry to PRODUCTS and its meters to METERS.
 * Retiring one: set `status: "deprecated"`. Deprecated meters stop being
 * offered but keep pricing live usage correctly. NEVER delete a meter id that
 * has been billed, and never re-use an id for different units.
 *
 * Rates here price the OPEN period only. Closed periods are priced from the
 * rate frozen onto their billing_period_lines rows, so changing a number in
 * this file can never move a bill that has already been rendered.
 */
export const PRODUCTS = {
  platform: { id: "platform", label: "Platform" },
  flags: { id: "flags", label: "Feature Flags" },
} as const;

export type ProductId = keyof typeof PRODUCTS;

export function isProductId(value: string): value is ProductId {
  return Object.hasOwn(PRODUCTS, value);
}

export type MeterStatus = "active" | "deprecated";

/**
 * The priced part of a meter, on its own: what a closed period freezes and
 * what every cost calculation actually reads. Pricing NEVER reaches for the
 * registry directly, so historical and live usage go through one code path.
 */
export type MeterRate = {
  /** Price in cents for `per` units, charged beyond `includedQuantity`. */
  unitAmountCents: number;
  per: number;
  /** Units included every period before charging starts. */
  includedQuantity: number;
};

export type Meter = MeterRate & {
  /** Stable key stored on every usage row. Never changes, never re-used. */
  id: string;
  product: ProductId;
  label: string;
  /** What one unit is, for the UI ("evaluations", "requests"). */
  unit: string;
  status: MeterStatus;
  description: string;
};

export const METERS: Meter[] = [
  {
    id: "flags.evaluations",
    product: "flags",
    label: "Flag evaluations",
    /**
     * EVENTS is the platform-wide unit. Every product meters the same word, so
     * a customer reasons about one number and one pooled credit rather than
     * learning a new vocabulary per product. What counts as an event differs
     * by product (here, one flag decision served); what it costs does not.
     */
    unit: "events",
    /**
     * $1.00 per 1M events.
     *
     * Four times the previous rate, and the number that makes this a business
     * rather than a hobby: 1B events invoices $1,000, which can fund support,
     * an SLA, and on-call. At $0.25 the same billion invoiced $250 and at the
     * original $0.05 it invoiced $50, which is not aggressive pricing, it is a
     * rounding error.
     *
     * Still far under the market it competes with: Vercel Flags is ~$30 per
     * million flag requests and LaunchDarkly bills roughly $83,000 for a
     * comparable billion. Being 30x cheaper wins deals; being 600x cheaper
     * just leaves the money on the table.
     */
    unitAmountCents: 100,
    per: 1_000_000,
    /**
     * Zero, deliberately. The allowance now comes ENTIRELY from the plan's
     * usage credit, which is what makes each plan's ceiling fall out of one
     * division: Pro's $20 buys exactly 20M, Hobby's $10 buys exactly 10M.
     * A blanket included quantity on top of that would silently add itself to
     * every plan and put both numbers off by a million.
     */
    includedQuantity: 0,
    status: "active",
    description:
      "Every flag decision served, however it was requested.",
  },
  {
    id: "flags.syncs",
    product: "flags",
    label: "Configuration syncs",
    unit: "sync events",
    /**
     * $0.75 per 1M, roughly 2x what serving them costs us.
     *
     * This is a GUARDRAIL, not a revenue line.
     * Evaluations cost almost nothing to meter, but config syncs are real
     * bandwidth and scale with SDK INSTANCE COUNT rather than with customer
     * value: a large idle fleet pays nothing on an evaluation meter while
     * costing us money every polling interval. Almost nobody will ever pay
     * this. It exists so a pathological fleet cannot bleed us.
     *
     * A sync is one full configuration payload actually served. A 304 is not
     * a sync, which is what makes conditional requests the cost lever they
     * are: at a 90% revalidation rate the same fleet costs a tenth as much.
     */
    unitAmountCents: 75,
    per: 1_000_000,
    /**
     * Zero on the meter; the real allowance is PER PLAN (src/lib/plans.ts),
     * because a free tier and a paid one need very different ceilings here
     * and a meter-level number would hand both the same one.
     */
    includedQuantity: 0,
    status: "active",
    description:
      "Each full configuration payload served to an SDK. Revalidations that return 304 are free.",
  },
];

const BY_ID = new Map(METERS.map((meter) => [meter.id, meter]));

export function getMeter(id: string): Meter | null {
  return BY_ID.get(id) ?? null;
}

export function activeMeters(): Meter[] {
  return METERS.filter((meter) => meter.status === "active");
}

/**
 * Products that actually meter something, in registry order.
 *
 * PRODUCTS is the label table and can name a product before it bills for
 * anything. Filter menus must come from HERE instead: offering a product with
 * no active meters gives people a filter that always returns nothing, which
 * reads as a broken page rather than an unlaunched product.
 */
export function activeProducts(): { id: ProductId; label: string }[] {
  const seen = new Set<ProductId>();
  for (const meter of activeMeters()) seen.add(meter.product);
  return Object.values(PRODUCTS)
    .filter((product) => seen.has(product.id))
    .map((product) => ({ id: product.id, label: product.label }));
}

/** The rate half of a meter, ready to freeze onto a closed period. */
export function meterRate(meter: Meter): MeterRate {
  return {
    unitAmountCents: meter.unitAmountCents,
    per: meter.per,
    includedQuantity: meter.includedQuantity,
  };
}

/** Units that get priced: everything past the rate's included allowance. */
export function billableQuantity(rate: MeterRate, quantity: number): number {
  return Math.max(0, quantity - rate.includedQuantity);
}

/**
 * Cost of `quantity` units at `rate`, in whole cents.
 *
 * Rounded UP per line so a fraction of a cent is never given away, then
 * summed: the invoice's per-line amounts always add up to its total.
 */
export function rateCostCents(rate: MeterRate, quantity: number): number {
  if (quantity <= 0 || rate.unitAmountCents <= 0 || rate.per <= 0) return 0;
  const billable = billableQuantity(rate, quantity);
  if (billable <= 0) return 0;
  return Math.ceil((billable * rate.unitAmountCents) / rate.per);
}

/** Cost at the meter's CURRENT rate. Only valid for the open period. */
export function meterCostCents(meter: Meter, quantity: number): number {
  return rateCostCents(meterRate(meter), quantity);
}

/**
 * Splits a meter's cost across the dimensions that produced it (projects),
 * pro rata by quantity.
 *
 * An included allowance belongs to the ORGANIZATION, not to any one project,
 * so there is no honest way to say which project "used up" the free million.
 * Allocating the post-allowance cost by share of quantity keeps the one
 * property that matters: the parts always sum to exactly the whole, so a
 * per-project view and the invoice never disagree. The largest share absorbs
 * the rounding remainder.
 */
export function allocateProRata(
  totalCents: number,
  quantities: number[],
): number[] {
  const sum = quantities.reduce((total, value) => total + value, 0);
  if (totalCents <= 0 || sum <= 0) return quantities.map(() => 0);

  const shares = quantities.map((quantity) =>
    Math.floor((totalCents * quantity) / sum),
  );
  let remainder = totalCents - shares.reduce((total, share) => total + share, 0);
  // Hand the leftover cents to the biggest contributors, largest first.
  const order = quantities
    .map((quantity, index) => ({ quantity, index }))
    .sort((a, b) => b.quantity - a.quantity);
  for (let i = 0; remainder > 0 && i < order.length; i += 1) {
    shares[order[i].index] += 1;
    remainder -= 1;
  }
  return shares;
}

/** "1M included, then $0.05 per 1M evaluations". */
export function formatMeterRate(meter: Meter): string {
  const rate = `${formatCents(meter.unitAmountCents)} per ${formatQuantity(meter.per)} ${meter.unit}`;
  return meter.includedQuantity
    ? `${formatQuantity(meter.includedQuantity)} included, then ${rate}`
    : rate;
}

/**
 * Money, always grouped. `toFixed(2)` renders $3123.39, which reads as a
 * number that happens to have a dollar sign rather than as an amount you owe;
 * at four figures the eye has to count digits to know the magnitude. Fixed
 * locale, because the currency is USD regardless of who is looking at it, and
 * a browser-local separator would render the same invoice differently per
 * viewer.
 */
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** 1_200_000 -> "1.2M" */
export function formatQuantity(quantity: number): string {
  if (quantity >= 1_000_000_000) return `${trim(quantity / 1_000_000_000)}B`;
  if (quantity >= 1_000_000) return `${trim(quantity / 1_000_000)}M`;
  if (quantity >= 1_000) return `${trim(quantity / 1_000)}K`;
  return String(quantity);
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * One priced row of a period. `meter` is null when the id is no longer in the
 * registry (a product retired entirely): the frozen label and rate still
 * price it, so old periods keep rendering.
 */
export type UsageLine = {
  meterId: string;
  product: string;
  label: string;
  unit: string;
  rate: MeterRate;
  quantity: number;
  costCents: number;
};

export type UsageTotals = {
  lines: UsageLine[];
  /** What the usage itself came to. */
  usageCents: number;
  /** How much of it the plan's included credit absorbs. */
  creditAppliedCents: number;
  /** Credit left for the rest of the period. */
  creditRemainingCents: number;
  /** What will actually be charged on top of the plan's base price. */
  overageCents: number;
};

/**
 * Applies the plan's included usage credit to a period's usage.
 *
 * Pro's $20 comes back as $20 of usage: the credit absorbs usage up to its
 * value, and only what exceeds it is billed on top. Invoices show the same
 * arithmetic - every meter as its own line, then the credit as a discount -
 * so the number on the invoice is explainable line by line.
 */
export function applyIncludedCredit(
  lines: UsageLine[],
  includedCreditCents: number,
): UsageTotals {
  const usageCents = lines.reduce((total, line) => total + line.costCents, 0);
  const creditAppliedCents = Math.min(
    usageCents,
    Math.max(includedCreditCents, 0),
  );
  return {
    lines,
    usageCents,
    creditAppliedCents,
    creditRemainingCents: Math.max(includedCreditCents - creditAppliedCents, 0),
    overageCents: Math.max(usageCents - creditAppliedCents, 0),
  };
}

/**
 * Builds a priced line from a live registry meter.
 *
 * `rate` overrides the meter's own rate, for meters whose included quantity is
 * a property of the PLAN rather than of the meter (see src/lib/quota.ts). The
 * override is what gets frozen onto a closed period, so a plan change later
 * cannot re-price a bill that already went out.
 */
export function lineFromMeter(
  meter: Meter,
  quantity: number,
  rate: MeterRate = meterRate(meter),
): UsageLine {
  return {
    meterId: meter.id,
    product: meter.product,
    label: meter.label,
    unit: meter.unit,
    rate,
    quantity,
    costCents: rateCostCents(rate, quantity),
  };
}
