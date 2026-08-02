import Stripe from "stripe";

/**
 * The API's Stripe client — the control plane owns billing (checkout, portal,
 * webhook, subscription sync); the console only renders screens and calls here.
 *
 * Billing is OPTIONAL configuration: the API boots and serves without any Stripe
 * env (self-hosters and pre-billing deploys never set it). Nothing is read at
 * module load; `getStripe()` constructs lazily and throws a clear error if the
 * key is absent, and `isBillingConfigured()` lets callers degrade gracefully.
 *
 * The API version is pinned to the SDK's own generated version so request and
 * response shapes always match the installed `stripe` types.
 */
const API_VERSION = "2026-06-24.dahlia" satisfies Stripe.StripeConfig["apiVersion"];

/**
 * The stable business identifier for the Pro plan's recurring price. Create a
 * $20/mo price in Stripe with this `lookup_key` (Product > add a price >
 * "lookup key"); the code resolves it to the live price id at runtime, so no
 * environment-specific `price_...` id is ever hardcoded or configured.
 */
export const PRO_PRICE_LOOKUP_KEY = "flagon_pro_monthly";

/**
 * The metered events price + its Billing Meter. Created by scripts/setup-metered.ts:
 * a Billing Meter named `flagon_events` and a metered per-unit price with lookup key
 * `flagon_events_metered` (at $0.02/1K) attached to the Pro product. Usage is reported
 * to the meter (billing.meterEvents.create with event_name = the meter name) and the
 * price turns it into an invoice line; the $20 credit grant offsets it.
 */
export const EVENTS_METER_EVENT_NAME = "flagon_events";
export const EVENTS_METERED_PRICE_LOOKUP_KEY = "flagon_events_metered";

/** Signing secret for the Stripe webhook endpoint (raw-body verification). */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/** True when a checkout can run (the secret key is set). */
export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: Stripe | null = null;

/** The Stripe client. Throws if `STRIPE_SECRET_KEY` is not set. */
export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe is not configured: set STRIPE_SECRET_KEY (and STRIPE_WEBHOOK_SECRET for the webhook). Billing is unavailable until then.",
    );
  }
  cached = new Stripe(key, {
    apiVersion: API_VERSION,
    appInfo: { name: "flagon", url: "https://flagon.io" },
  });
  return cached;
}

let cachedPriceId: string | null = null;

/**
 * Resolve the Pro price id from its stable `lookup_key`. Cached in-memory for
 * the process (prices effectively never change) so checkout does not pay a
 * Stripe round-trip each time. Throws a clear error if the price was never
 * created with the expected lookup key.
 */
export async function getProPriceId(): Promise<string> {
  if (cachedPriceId) return cachedPriceId;
  const stripe = getStripe();
  const prices = await stripe.prices.list({
    lookup_keys: [PRO_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(
      `No active Stripe price with lookup_key "${PRO_PRICE_LOOKUP_KEY}". Create a $20/mo recurring price with that lookup key in Stripe.`,
    );
  }
  cachedPriceId = price.id;
  return price.id;
}

let cachedMeteredPriceId: string | null = null;

/**
 * Resolve the metered events price id from its `lookup_key`. Same caching/behavior as
 * `getProPriceId`. Throws if setup-metered.ts hasn't created the meter + price yet.
 */
export async function getMeteredPriceId(): Promise<string> {
  if (cachedMeteredPriceId) return cachedMeteredPriceId;
  const stripe = getStripe();
  const prices = await stripe.prices.list({
    lookup_keys: [EVENTS_METERED_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(
      `No active Stripe price with lookup_key "${EVENTS_METERED_PRICE_LOOKUP_KEY}". Run scripts/setup-metered.ts to create the events meter + metered price.`,
    );
  }
  cachedMeteredPriceId = price.id;
  return price.id;
}
