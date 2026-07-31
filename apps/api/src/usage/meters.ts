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
    // $0.05 / 1K = $50 / 1M: the going market rate for analytics events. We meter
    // per event at the market rate (our per-event compute is light, so it stays
    // comfortably profitable) and compete on breadth of products, not on price.
    // The free allowance is per-plan (Hobby 2M / Pro 5M) and lives with the plans;
    // this is the overage rate applied beyond it.
    pricePerMillionCents: 5000,
    includedQuantity: 0,
  },
} satisfies Record<MeterId, Meter>;

/** The meter that flag_eval_rollups feeds (free flag evaluations). */
export const CHECKS_METER = METERS["flag.checks"];
/** The billable events meter — the platform-wide money meter (usage_event_rollups). */
export const EVENTS_METER = METERS.events;

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
