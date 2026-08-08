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

export type MeterId =
  | "flag.checks"
  | "events"
  // Checks product — SYNTHETIC runs are metered per run, mirroring Checkly (a browser
  // run is ~25x an API run). Its own billable unit / Stripe meter, separate from the
  // `events` money meter so check runs never touch the exposures allowance/credit.
  | "check.runs.browser"
  | "check.runs.api"
  // UPTIME monitors are metered as a GAUGE — the current active-monitor COUNT, billed
  // per monitor/month via Stripe's `last` aggregation (the sweep reports the count).
  // Metered (not licensed) so the shared $50 credit covers it; see lib/billing.ts.
  | "check.monitors.uptime";

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
  /**
   * How the Stripe Billing Meter aggregates reported values over a period:
   *   - "sum"  (default): add up every reported value (per-event usage — events, runs).
   *   - "last": take the LAST reported value (a GAUGE — the current count of a thing,
   *     e.g. active uptime monitors, reported each sweep).
   */
  aggregation?: "sum" | "last";
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
  "check.runs.browser": {
    id: "check.runs.browser",
    product: "Checks",
    label: "Browser check runs",
    unit: "run",
    billable: true,
    tracked: true, // recorded in usage_event_rollups (source "checks.browser")
    // Checkly-parity: a browser run costs ~25x an API run (Chromium is the heavy cost).
    // $6.25 / 1k browser runs = $6,250,000 / 1M — the committed launch rate. Drawn from the
    // shared $50 credit like every meter (no separate free tier).
    pricePerMillionCents: 6_250_000,
    includedQuantity: 0,
  },
  "check.runs.api": {
    id: "check.runs.api",
    product: "Checks",
    label: "API check runs",
    unit: "run",
    billable: true,
    tracked: true, // recorded in usage_event_rollups (source "checks.api")
    // Checkly-parity: API runs are the CHEAP synthetic family ($2.50/10k = $0.25/1K =
    // $250,000/1M), far below a browser run — the committed launch rate.
    pricePerMillionCents: 250_000,
    includedQuantity: 0,
  },
  "check.monitors.uptime": {
    id: "check.monitors.uptime",
    product: "Checks",
    label: "Uptime monitors",
    unit: "monitor",
    billable: true,
    tracked: true, // reported to Stripe as a gauge by the usage sweep (lib/billing.ts)
    // $0.32 / active monitor / month = 32c per monitor = 32,000,000 c / 1M — the committed
    // launch rate. Metered as a GAUGE via `last` aggregation: the sweep reports the current
    // count, Stripe bills the last value. The shared $50 credit covers ~156 monitors (plans.ts).
    pricePerMillionCents: 32_000_000,
    includedQuantity: 0,
    aggregation: "last",
  },
} satisfies Record<MeterId, Meter>;

/** The metered uptime-monitors gauge — the current active-monitor count, billed by count. */
export const UPTIME_MONITORS_METER = METERS["check.monitors.uptime"];

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
  /** The meter this source's usage is PRICED under (its allowance/rate lever). Lets
   *  a source bill at its own rate — e.g. check runs price under the check-run
   *  meters, not the platform `events` meter. */
  meterId: MeterId;
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
    meterId: "events",
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
    meterId: "events",
    eventName: "flagon_events",
    priceLookupKey: "flagon_events_metered",
    product: "Experiments",
    label: "Metric events",
  },
  // Synthetic check runs — the Checks product. Metered per run under their own Stripe
  // meter/price (browser ~25x an API run), separate from `events` so they never dilute
  // the exposures allowance/credit. Ingested via ingestEvents(..., { source }) from
  // checks/runner.ts; the type's `billingSource` picks the source. UPTIME monitors do
  // NOT appear here — they are billed by monitor COUNT (lib/plans.ts, lib/billing.ts).
  "checks.browser": {
    meterId: "check.runs.browser",
    eventName: "flagon_check_runs_browser",
    priceLookupKey: "flagon_check_runs_browser_metered",
    product: "Checks",
    label: "Browser runs",
  },
  "checks.api": {
    meterId: "check.runs.api",
    eventName: "flagon_check_runs_api",
    priceLookupKey: "flagon_check_runs_api_metered",
    product: "Checks",
    label: "API check runs",
  },
};

/**
 * Whether a durable-event `source` rolls up into the platform `events` money meter
 * (the exposures/analytics unit). Only these sources touch the monthly events
 * counter + its allowance/credit; check-run sources are metered + billed on their
 * OWN meters and must NOT bump the events counter. Unknown sources default to the
 * events meter (the historical default, `flags.exposure`).
 */
export function isEventsMeterSource(source: string): boolean {
  return (SOURCE_METERS[source]?.meterId ?? "events") === "events";
}

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
