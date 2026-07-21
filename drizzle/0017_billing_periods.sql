-- Billing periods: the frozen record of what an organization was billed.
--
-- usage_rollups (0016) is the LIVE ledger: it answers "what is happening
-- right now" and is recomputed from today's meter registry every time it is
-- read. That is exactly wrong for history. Re-price a meter and last March
-- would silently re-price with it, so the usage page would stop agreeing
-- with the invoice that was actually paid.
--
-- So a period is CLOSED into a snapshot: its window, its plan, its credit,
-- and one row per meter/project with the RATE THAT APPLIED AT THE TIME.
-- Closed periods are read from the snapshot and never recomputed; the open
-- period is computed live from rollups. The Stripe invoice is built from the
-- snapshot, and the snapshot's status is what makes invoicing idempotent:
-- a period is invoiced once because the row says so.
--
-- The organization is the billing entity, so every period belongs to one org
-- and follows THAT org's own subscription cycle, not the calendar.

-- The org's current Stripe subscription cycle. Null until it subscribes, in
-- which case the calendar month is the honest window to show (see
-- src/lib/billing-period.ts). Mirrored from the subscription on every
-- checkout completion and subscription update.
ALTER TABLE organizations
  ADD COLUMN current_period_start timestamptz,
  ADD COLUMN current_period_end timestamptz;

-- Historical usage must survive the deletion of the project that produced
-- it. ON DELETE SET NULL silently folded a deleted project's usage into the
-- org-level bucket, which both corrupted the per-project breakdown and could
-- collide with the COALESCE unique index. project_id stays a plain dimension
-- column: the org scope (and its RLS) is what constrains the row, and closed
-- periods snapshot the project NAME so deleted projects still render.
ALTER TABLE usage_rollups DROP CONSTRAINT usage_rollups_project_id_fkey;

-- Slicing by project ("all projects" vs one) is a first-class filter on the
-- usage page, so it gets its own index rather than riding the org+day scan.
CREATE INDEX usage_rollups_org_project_day_idx
  ON usage_rollups (organization_id, project_id, day);

-- Meter-level slicing for the product/meter filters.
CREATE INDEX usage_rollups_org_meter_day_idx
  ON usage_rollups (organization_id, meter, day);

CREATE TABLE billing_periods (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Inclusive day window, matching the usage_rollups grain.
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- open      -> still accruing; read live from usage_rollups
  -- closed    -> frozen into billing_period_lines, not yet sent to Stripe
  -- invoiced  -> lines attached to a Stripe invoice (see stripe_invoice_id)
  -- void      -> superseded (plan change mid-cycle, correction)
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'invoiced', 'void')),
  -- The plan AS IT WAS, so a downgrade doesn't rewrite an old bill.
  plan text NOT NULL,
  included_credit_cents integer NOT NULL DEFAULT 0,
  -- Frozen totals; the sum of this period's lines, by construction.
  usage_cents integer NOT NULL DEFAULT 0,
  credit_applied_cents integer NOT NULL DEFAULT 0,
  overage_cents integer NOT NULL DEFAULT 0,
  stripe_invoice_id text,
  closed_at timestamptz,
  invoiced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One period per org per window: the close is an upsert onto this, so a
-- retried close updates the snapshot instead of duplicating it.
CREATE UNIQUE INDEX billing_periods_org_start_idx
  ON billing_periods (organization_id, period_start);

-- The history list: an org's periods, newest first.
CREATE INDEX billing_periods_org_start_desc_idx
  ON billing_periods (organization_id, period_start DESC);

CREATE TABLE billing_period_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  -- Denormalized for RLS: every tenant-scoped table carries its own org.
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  billing_period_id uuid NOT NULL
    REFERENCES billing_periods(id) ON DELETE CASCADE,
  meter text NOT NULL,
  product text NOT NULL,
  -- Dimension columns, not foreign keys: a closed period must still read
  -- correctly after the project is deleted, hence the name snapshot.
  project_id uuid,
  project_name text,
  quantity bigint NOT NULL DEFAULT 0,
  -- The rate that applied when the period closed. THIS is what makes the
  -- snapshot authoritative: re-pricing the meter tomorrow cannot move it.
  unit_amount_cents integer NOT NULL,
  per bigint NOT NULL,
  included_quantity bigint NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One line per period per meter per project; the close upserts onto it.
CREATE UNIQUE INDEX billing_period_lines_unique_idx
  ON billing_period_lines (
    billing_period_id,
    meter,
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX billing_period_lines_period_idx
  ON billing_period_lines (billing_period_id);

-- Product data: tenant-scoped, deny-by-default, queried through withTenant.
ALTER TABLE billing_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_periods_tenant_isolation ON billing_periods
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE billing_period_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_period_lines_tenant_isolation ON billing_period_lines
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_periods TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON billing_period_lines TO flagon_app;
