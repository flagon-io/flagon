-- Org contracts: the negotiated envelope, as data.
--
-- Enterprise is priced from usage ESTIMATES agreed up front, so a period's
-- metered value is not what the customer owes. Until now that fact lived only
-- in a comment (src/lib/plans.ts), which meant the console had nothing to
-- render but the priced view: a $0.00 subscription line, the full metered
-- value as a subtotal, and a "total" nobody has ever been asked to pay.
--
-- This table is what the contracted view reads instead.
--
-- TERM-WIDE, NOT MONTHLY. The envelope covers the whole agreement term and is
-- drawn down cumulatively across it. That is the entire point: a customer with
-- a heavy summer and a quiet winter is exactly on plan, and a monthly envelope
-- would fire an alarm in July and hide the recovery in January. The only
-- honest pair of numbers is cumulative consumption against elapsed term.
--
-- QUANTITY, NOT DOLLARS. What was signed is volume. Storing the envelope in
-- cents would let a later re-pricing of a meter retroactively change what the
-- agreement covered, which is precisely the drift billing_period_lines (0017)
-- exists to prevent on the billing side.
--
-- Nothing in the app WRITES this table yet - contracts are set up out of band
-- and the operator console will own writes. It is deliberately readable and
-- inert: an org with no active row simply has no envelope to show.

CREATE TABLE org_contracts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Inclusive day window, matching the usage_rollups grain so term-to-date is
  -- a plain range scan over the existing (organization_id, meter, day) index.
  term_start date NOT NULL,
  term_end date NOT NULL,
  CONSTRAINT org_contracts_term_order CHECK (term_end >= term_start),

  -- Negotiated volume per meter for the WHOLE TERM, e.g.
  --   {"flags.evaluations": 750000000, "flags.syncs": 2000000000}
  -- Same shape as PLANS[plan].meterAllowances in src/lib/plans.ts, on purpose:
  -- a contract is a plan instance for one organization, and the same lookup
  -- code reads both. Meters absent from the object have no contracted volume
  -- and are reported as consumption without an envelope rather than as zero.
  meter_allowances jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Free text for whoever has to reconcile this against the paperwork.
  note text,

  -- active  -> the agreement in force; at most one per org
  -- expired -> superseded by a renewal, kept for history
  -- void    -> entered in error
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'void')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one agreement in force per org. Partial, so a renewal expires the
-- old row and inserts a new one without ever colliding, and history survives.
CREATE UNIQUE INDEX org_contracts_one_active_idx
  ON org_contracts (organization_id)
  WHERE status = 'active';

-- The history list for one org, newest term first.
CREATE INDEX org_contracts_org_term_idx
  ON org_contracts (organization_id, term_start DESC);

-- Product data: tenant-scoped, deny-by-default, queried through withTenant.
ALTER TABLE org_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_contracts_tenant_isolation ON org_contracts
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_contracts TO flagon_app;
