-- An operator-visible signal that the FINAL overage invoice for a cancelled
-- subscription could not be cut.
--
-- customer.subscription.deleted is the only chance to bill a cancelled org's
-- last cycle (no renewal invoice will ever be cut for it), and that work is
-- deliberately best-effort so a Stripe hiccup never strands the org on the
-- wrong plan. The cost of "best-effort" is that a genuine failure used to
-- vanish into a log line. This column records it: the webhook stamps it when
-- invoiceFinalCycle throws, and sudo (the operator console) surfaces it so the
-- final overage can be collected by hand. Cleared when a later cancel succeeds
-- or the org re-subscribes.
--
-- No new grant or RLS classification: `organizations` is already granted to
-- flagon_app and classified (auth-layer, drizzle/0000); a new column on an
-- already-granted table inherits the table's privileges.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS final_invoice_failed_at timestamptz;
