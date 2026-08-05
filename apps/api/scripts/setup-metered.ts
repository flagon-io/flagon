/**
 * DEPRECATED — superseded by scripts/sync-stripe.ts (`npm run stripe:sync`).
 *
 * This script created the metered events price on the SAME "Flagon Pro" product as the
 * flat base price, which made the two checkout/invoice lines read identically ("Flagon
 * Pro" twice) and set no product descriptions. sync-stripe.ts is the canonical,
 * build-wired reconciler: it puts the metered price on its own "Flagon Platform Usage"
 * product, keeps the rate pinned to the code (EVENTS_METER), sets both product
 * descriptions, and migrates existing subscriptions. Run that instead.
 */
console.error(
  "setup-metered.ts is deprecated. Run `npm run stripe:sync` instead " +
    "(scripts/sync-stripe.ts) — it is idempotent and reconciles products, prices, " +
    "descriptions, and subscriptions to the code.",
);
process.exit(1);
