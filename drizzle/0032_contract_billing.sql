-- Enterprise metered overage billing (the GitHub model).
--
-- 0030 modelled a contract as term-wide volume envelopes (meter_allowances) and
-- nothing was ever auto-billed: enterprise was invoiced entirely by agreement.
-- That is only half the picture. A contract covers SOME usage (Feature Flags,
-- against the negotiated base bill) but not all of it: a product added later, or
-- overage past an included allowance on a metered product (think GitHub Actions
-- minutes), has to be billed automatically and shown separately from the base.
--
-- So a contracted org's meters fall into two modes:
--
--   covered  -> in meter_allowances; a TERM envelope drawn down as volume,
--               overage coordinated at renewal, never auto-invoiced.
--   metered  -> a PER-CYCLE included allowance, overage auto-invoiced each cycle
--               at the meter's rate. A meter not named in meter_allowances is
--               metered by default, so a newly-adopted product auto-bills.
--
-- Terms and the base fee live in Stripe (the enterprise subscription), not here.

ALTER TABLE org_contracts
  -- Per-CYCLE included quantity for metered meters, e.g.
  --   {"flags.syncs": 1000000}
  -- Resets every billing cycle (unlike the term-wide meter_allowances). A
  -- metered meter absent here uses the meter's own includedQuantity (usually 0).
  ADD COLUMN metered_allowances jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Optional negotiated overage rate per metered meter, e.g.
  --   {"flags.syncs": {"unit_amount_cents": 50, "per": 1000000}}
  -- Absent -> the published meter rate (src/lib/meters.ts). This is the only
  -- place a contract can move a per-unit price without moving the global rate.
  ADD COLUMN metered_rates jsonb NOT NULL DEFAULT '{}'::jsonb;

-- How each frozen line was treated when the period closed, so history never
-- depends on today's contract (the contract can change; a closed period cannot).
--
--   priced   -> pro/free: the plan rate, pooled credit applied. The default, so
--               every existing closed line keeps its meaning with no backfill.
--   covered  -> enterprise, in the contract envelope: recorded as volume,
--               cost_cents 0, not billed.
--   metered  -> enterprise, billed on top: cost_cents is the per-cycle overage,
--               and unit_amount_cents/per/included_quantity carry the metered
--               rate and per-cycle included that produced it.
ALTER TABLE billing_period_lines
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'priced'
    CHECK (billing_mode IN ('priced', 'covered', 'metered'));
