-- Organizations carry their plan (the org is the billing entity).
--
-- "free" is the default for every org; Pro/Enterprise are set by the billing
-- flow. On billing-disabled deployments (self-host, or pre-Stripe) the column
-- exists but entitlements resolve all-on regardless (src/lib/billing.ts).
-- Stripe linkage (stripe_customer_id etc.) arrives with the billing core.

ALTER TABLE organizations ADD COLUMN plan text NOT NULL DEFAULT 'free';
