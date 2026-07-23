-- Per-organization entitlement overrides: the custom deal, for ANY plan.
--
-- The gap this closes: until now, what an org was entitled to could only be
-- expressed two ways, and neither fits a negotiated non-enterprise deal.
--
--   PLANS[plan] constants  - the same for every org on that plan. A customer
--                            paying $100/mo for Pro because they always
--                            overage got $20 of credit, because
--                            orgBillingContext read the constant and there was
--                            nothing per-org to read instead.
--
--   org_contracts (0030)   - structurally enterprise-only: meterBillingMode()
--                            returns 'priced' for anything that is not
--                            enterprise, so a Pro org's contract row, had one
--                            existed, would have been ignored entirely.
--
-- So this table is the missing middle: an override that applies to whatever
-- plan the org is on, letting a Pro customer be sold a genuinely custom price
-- WITH the entitlements that price is supposed to buy.
--
-- DELIBERATELY NOT org_contracts. A contract is an AGREEMENT: it has a term,
-- it is drawn down cumulatively across that term, and it exists because
-- someone signed something. A $100/mo Pro customer has no term and signed
-- nothing; they just have a different number than the list price. Folding the
-- two together would have meant either giving every custom price a fake term
-- or making a contract's term nullable, and both make the enterprise view -
-- the one thing org_contracts is actually good at - harder to reason about.
--
-- The two compose instead. Resolution order, lowest to highest precedence
-- (src/lib/entitlements.ts):
--
--   PLANS[plan]        published default
--   plan_prices        the price version the org is on (0035)
--   org_entitlements   THIS TABLE - the negotiated override
--   org_contracts      enterprise only: covered vs metered per meter (0030/32)
--
-- Every column is NULLABLE or empty-by-default and means "inherit". A row that
-- overrides only the credit leaves allowances resolving from the price, which
-- is what makes a partial override safe to write.
--
-- GLOBAL, no RLS - but read by the app for the CURRENT org on every usage
-- surface. Tenant isolation would be the natural choice; it is not used here
-- because the app must be able to resolve entitlements while closing periods
-- and serving quota checks on paths that are not inside withTenant, and the
-- table carries no customer-authored content. Reads are always by
-- organization_id from a session-resolved org, never by user input.

CREATE TABLE org_entitlements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Usage credit this org absorbs each cycle, overriding the price/plan.
  --
  -- NULL means inherit - which is NOT the same as 0. Zero is a real, sellable
  -- configuration ("you pay $100 and every unit is billable"), so the two must
  -- be distinguishable and a NOT NULL DEFAULT 0 would have silently zeroed the
  -- credit of every org the moment a row was created for any other reason.
  included_credit_cents integer CHECK (included_credit_cents >= 0),

  -- Per-meter included quantity before pricing starts, e.g.
  --   {"flags.syncs": 200000000}
  -- Merged OVER the price's allowances per meter, so overriding syncs does not
  -- discard the evaluations allowance. Empty object = inherit everything.
  meter_allowances jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Negotiated per-unit overage rate, e.g.
  --   {"flags.evaluations": {"unit_amount_cents": 75, "per": 1000000}}
  -- The non-enterprise equivalent of org_contracts.metered_rates: it lets a
  -- deal move one customer's per-unit price without touching the published
  -- rate in src/lib/meters.ts. Absent meter = the published rate.
  metered_rates jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Consumption ceilings, for the rare case of a custom hard cap.
  --
  -- NULL means inherit (Hobby stays capped, Pro stays uncapped). An explicit
  -- '{}' means EXPLICITLY UNCAPPED - which is how you lift Hobby's cap for a
  -- trial without moving the org off Hobby. That distinction is the only
  -- reason this column is nullable jsonb rather than NOT NULL DEFAULT '{}'.
  hard_caps jsonb,

  -- Why this org has bespoke terms, for whoever inherits the account.
  note text,

  -- active -> in force; at most one per org.
  -- void   -> superseded or entered in error, kept so the history of what a
  --           customer was promised survives being changed.
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'void')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one override in force per org. Partial, so revising terms is
-- void-then-insert and the previous terms remain readable.
CREATE UNIQUE INDEX org_entitlements_one_active_idx
  ON org_entitlements (organization_id)
  WHERE status = 'active';

CREATE INDEX org_entitlements_org_idx
  ON org_entitlements (organization_id, created_at DESC);

-- Read by the app to resolve the current org's entitlements; written by the
-- operator console as the owner.
GRANT SELECT ON org_entitlements TO flagon_app;
