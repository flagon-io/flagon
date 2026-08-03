/**
 * The meter registry: what Flagon meters, and what it charges for each.
 *
 * The billing model mirrors the market leaders (Statsig/LaunchDarkly-style):
 * **flag & config checks are free and unlimited** — that is the wedge — and the
 * money meter is **events** (exposures / analytics events). We still COUNT the
 * free meters (for the "unlimited checks" value prop and fair-use), we just never
 * bill them.
 *
 * Events is a PLATFORM-LEVEL meter, deliberately NOT tied to Feature Flags: it is
 * the generic billable unit that every product's telemetry rolls up into (flag
 * exposures today, other products' events later). Which product produced an event
 * is carried by the rollup's `source` column (see usage/events.ts), so the price
 * and allowance stay a single lever while the breakdown stays per-product.
 *
 * `billable` decides whether a meter charges; `tracked` says whether Flagon
 * actually records it yet. Both meters are tracked today: checks in
 * flag_eval_rollups, events in usage_event_rollups (fed by POST /ofrep/v1/exposures).
 *
 * `pricePerMillionCents` is THE per-unit lever; the per-plan free allowance
 * (how many events each plan includes before overage) lives with the plans, not
 * here — the meter prices a raw unit, the plan says how many are free. Change
 * either and the usage page reprices. Nothing is enforced yet; this powers the
 * picture, not a paywall.
 */

export type MeterId = "flag.checks" | "events";

export type Meter = {
  id: MeterId;
  /** The product this meter rolls up under (the invoice groups line items by product). */
  product: string;
  /** The line-item label in the usage table. */
  label: string;
  /** The unit the raw quantity is counted in, singular (e.g. "check", "event"). */
  unit: string;
  /** Whether this meter is charged for. Free meters still count usage. */
  billable: boolean;
  /** Whether Flagon records this meter yet (both meters are tracked today). */
  tracked: boolean;
  /** Price per 1,000,000 units, in cents. 0 for free meters. THE pricing lever. */
  pricePerMillionCents: number;
  /** Quantity included before any charge accrues (0 = every unit is billable). */
  includedQuantity: number;
};

export const METERS = {
  "flag.checks": {
    id: "flag.checks",
    product: "Feature Flags",
    label: "Flag checks",
    unit: "check",
    billable: false, // free + unlimited — the competitive wedge
    tracked: true, // recorded in flag_eval_rollups
    pricePerMillionCents: 0,
    includedQuantity: 0,
  },
  events: {
    id: "events",
    // Platform-level, NOT "Feature Flags": every product's billable events roll up
    // here under one price. The producing product is the rollup's `source`.
    product: "Platform",
    label: "Events",
    unit: "event",
    billable: true, // THE money meter — exposures / analytics events, any product
    tracked: true, // recorded in usage_event_rollups (POST /ofrep/v1/exposures)
    // $0.03 / 1K = $30 / 1M: BELOW Statsig's $0.05/1K exposure rate. $0.03 is the
    // HIGHEST rate that still keeps Flagon's total bill at or under Statsig's at every
    // volume — with a $50 credit the two curves cross exactly at Statsig's 5M bundle
    // edge and Flagon stays cheaper on either side. Charge more per event and you poke
    // above them in the mid-volume band; this is the "most money without passing the
    // line" point. An exposure is a batched DB write, so per-unit infra is a fraction
    // of a cent — the rate is positioning, not cost recovery, and stays ~99.9% margin.
    // Pro's $50/mo is a usage credit ($50 buys ~1.67M at this rate); Hobby's 500K free
    // ceiling lives with the plans. This is the overage rate.
    pricePerMillionCents: 3000,
    includedQuantity: 0,
  },
} satisfies Record<MeterId, Meter>;

/** The meter that flag_eval_rollups feeds (free flag evaluations). */
export const CHECKS_METER = METERS["flag.checks"];
/** The billable events meter — the platform-wide money meter (usage_event_rollups). */
export const EVENTS_METER = METERS.events;

/**
 * The billing registry that maps a durable-event `source` to its Stripe meter + price
 * + invoice product. This is THE extension point: a future product bills usage by
 * adding a row here (a new source namespace + its own Stripe meter/price) — the
 * reporting sweep, the shared $50 credit (scoped to all metered prices), and the
 * tie-out all work unchanged. `eventName` is the Stripe Billing Meter's event_name;
 * `priceLookupKey` resolves the metered price at runtime (like the flat Pro price).
 */
export type SourceMeter = {
  /** Stripe Billing Meter event_name (reported via billing.meterEvents.create). */
  eventName: string;
  /** Lookup key of the metered Stripe price attached to that meter. */
  priceLookupKey: string;
  /** Invoice/UI product label this source rolls up under (its per-product band). */
  product: string;
  /** Display name for this source's line on the usage page (e.g. "Flag exposures"). */
  label: string;
};

export const SOURCE_METERS: Record<string, SourceMeter> = {
  "flags.exposure": {
    eventName: "flagon_events",
    priceLookupKey: "flagon_events_metered",
    product: "Feature Flags",
    label: "Flag exposures",
  },
  // Experiment goal (metric) events sent via POST /ofrep/v1/track. Namespaced
  // "experiments.metric" (NOT "flags.*") so this feature stays self-contained and
  // clear of any future OTEL metrics. They bill under the SAME Stripe meter + price
  // as exposures (one "events" unit, one $0.03/1K rate, one shared credit/allowance)
  // — so measuring outcomes generates revenue with no new Stripe provisioning — but
  // carry their own product/label so the usage page breaks them out as a distinct
  // Experiments line. Each source stages its own report row (own identifier), so
  // summing into one meter never collides.
  "experiments.metric": {
    eventName: "flagon_events",
    priceLookupKey: "flagon_events_metered",
    product: "Experiments",
    label: "Metric events",
  },
};

/** The meter config for a durable-event source, or null if that source isn't billed. */
export function sourceMeter(source: string): SourceMeter | null {
  return SOURCE_METERS[source] ?? null;
}

/**
 * Charge in cents for a raw quantity on a meter, above its included amount. Free
 * meters never charge. Fractional cents are intentional (a day's slice is often a
 * fraction of a cent); the UI rounds for display.
 */
export function chargeCents(meter: Meter, quantity: number): number {
  if (!meter.billable) return 0;
  const billable = Math.max(0, quantity - meter.includedQuantity);
  return (billable / 1_000_000) * meter.pricePerMillionCents;
}
