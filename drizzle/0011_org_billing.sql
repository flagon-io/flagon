-- Stripe linkage for organizations (the billing entity). Customers are
-- created lazily at first upgrade, so orgs on billing-disabled deployments
-- (self-host) simply never populate these.

ALTER TABLE organizations ADD COLUMN stripe_customer_id text;
ALTER TABLE organizations ADD COLUMN stripe_subscription_id text;

CREATE UNIQUE INDEX organizations_stripe_customer_uidx
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX organizations_stripe_subscription_uidx
  ON organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
