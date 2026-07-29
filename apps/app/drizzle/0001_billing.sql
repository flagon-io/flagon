-- Billing: map an organization to its Stripe subscription.
--
-- Flat $20/mo Pro via Stripe Checkout. These three columns are the ENTIRE
-- source of truth the app keeps about a subscription; everything else (price,
-- discounts, invoices, card) lives in Stripe and is reached via the billing
-- portal. `subscription_status` mirrors the Stripe subscription status
-- (active | trialing | past_due | canceled | ...), written by the webhook.
--
-- The unique index lets the webhook resolve an org from a Stripe customer id
-- (events like customer.subscription.updated carry the customer, not our org).
-- NULLs are distinct in Postgres, so orgs without a customer coexist fine.
ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "subscription_status" text;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_stripe_customer_id_key" ON "organizations" ("stripe_customer_id");
