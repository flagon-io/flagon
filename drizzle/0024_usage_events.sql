-- Durable usage ingest: raw events, monthly quota counters, and the Stripe
-- invoicing lease.
--
-- 0016 gave us usage_rollups, the small forever-table the usage page and the
-- invoice builder read. What it did NOT give us is a way to ingest safely:
-- recordUsage() accumulated straight into the rollup, so a retried edge batch
-- silently billed twice, and nothing anywhere reserved quota. The comment in
-- 0016 promised "receipts land with the edge" - this is that.
--
-- Three tables, three jobs:
--
--   usage_events         the durable, idempotent write path. One row per
--                        caller-supplied event id. The unique index IS the
--                        receipt: a replayed id conflicts and does nothing.
--
--   evaluation_counters  the monthly reservation. Incremented in the SAME
--                        transaction that writes the receipt, so a request
--                        that is rejected leaves neither behind.
--
--   billing_invoice_claims  an expiring lease taken BEFORE calling Stripe, so
--                        two concurrent invoice.created deliveries cannot both
--                        add invoice items.
--
-- All three are product data: tenant-scoped RLS keyed on app.current_org_id,
-- explicit grants, queried only through withTenant. Nothing here is
-- classified as auth-layer.

-- ---------------------------------------------------------------------------
-- usage_events
-- ---------------------------------------------------------------------------

CREATE TABLE usage_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Dimension column, not a foreign key, for the same reason as
  -- usage_rollups.project_id (drizzle/0017): metered history has to outlive
  -- the project that produced it.
  project_id uuid,
  meter text NOT NULL,
  -- The idempotency key, supplied by the caller (an OFREP request id, an edge
  -- batch id). Scoped per org+meter so two tenants can never collide and one
  -- tenant's id space stays its own. See src/lib/usage-events.server.ts for
  -- the documented fallback when a caller supplies nothing.
  event_key text NOT NULL,
  quantity bigint NOT NULL CHECK (quantity > 0),
  -- When the usage HAPPENED, which is not when we heard about it: a batch
  -- posted late still lands on the day it was produced.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- Denormalized rollup grain, derived from occurred_at at insert time so
  -- compaction never has to re-derive (and never disagrees with) the bucket.
  day date NOT NULL,
  -- NULL until the row has been folded into usage_rollups. The compaction
  -- worker sets it in the same transaction as the rollup upsert, which is what
  -- makes compaction exactly-once across crashes and retries.
  compacted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- THE RECEIPT. A retried event id conflicts here and the insert does nothing,
-- so neither the raw event nor the quota reservation happens twice.
CREATE UNIQUE INDEX usage_events_receipt_idx
  ON usage_events (organization_id, meter, event_key);

-- The compaction claim: pending rows for one org, oldest first (uuidv7 ids are
-- time-ordered, so the primary key IS the arrival order). Partial, because
-- compacted rows are the overwhelming majority and are never scanned this way.
CREATE INDEX usage_events_pending_idx
  ON usage_events (organization_id, id)
  WHERE compacted_at IS NULL;

-- Retention sweep: compacted events are redundant with the rollup and get
-- deleted after a retention window (src/lib/maintenance.ts).
CREATE INDEX usage_events_compacted_at_idx
  ON usage_events (compacted_at)
  WHERE compacted_at IS NOT NULL;

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_events_tenant_isolation ON usage_events
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON usage_events TO flagon_app;

-- ---------------------------------------------------------------------------
-- evaluation_counters
-- ---------------------------------------------------------------------------

-- The live quota reservation, at MONTH grain.
--
-- Deliberately not the billing period: a hard cap has to be answerable in one
-- indexed lookup on the hot evaluation path, and the org's subscription cycle
-- is a moving target that would make the counter's identity change underneath
-- it. Hobby orgs have no subscription and therefore no cycle anyway - the
-- calendar month is the honest window (see src/lib/billing-period.ts).
--
-- Money still comes from usage_rollups and the frozen period snapshots. This
-- table only ever answers "may this request proceed".
CREATE TABLE evaluation_counters (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  meter text NOT NULL,
  -- First day of the UTC month this counter covers.
  period_month date NOT NULL,
  used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One counter per org per meter per month. The upsert targets this, and the
-- row lock it takes is what serializes concurrent reservations.
CREATE UNIQUE INDEX evaluation_counters_unique_idx
  ON evaluation_counters (organization_id, meter, period_month);

ALTER TABLE evaluation_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY evaluation_counters_tenant_isolation ON evaluation_counters
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON evaluation_counters TO flagon_app;

-- ---------------------------------------------------------------------------
-- billing_invoice_claims
-- ---------------------------------------------------------------------------

-- The lease that makes invoicing safe under concurrent webhook delivery.
--
-- billing_periods.status already makes invoicing idempotent AFTER the fact:
-- once a period is 'invoiced' nothing re-bills it. The gap is the window
-- BEFORE that flip. Stripe retries webhooks and can deliver the same
-- invoice.created twice concurrently; both deliveries would read status
-- 'closed', both would call addUsageToInvoice, and the invoice would carry the
-- usage twice. Nothing in Stripe's API would reject that.
--
-- So the external call is claimed first. The claim is an expiring LEASE rather
-- than a plain flag, because a worker that dies mid-call must not wedge the
-- invoice forever: the claim ages out and the next delivery retries it. Once
-- the invoice items are attached the claim goes 'completed', which is
-- terminal - no expiry can revive it.
CREATE TABLE billing_invoice_claims (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_invoice_id text NOT NULL,
  -- Which period's usage this claim covers. Nullable and ON DELETE SET NULL:
  -- the claim is a record of an external side effect and must outlive the
  -- period row it happened to be about.
  billing_period_id uuid REFERENCES billing_periods(id) ON DELETE SET NULL,
  -- claimed   -> a worker holds the lease until expires_at
  -- completed -> invoice items attached; TERMINAL, never re-claimable
  -- failed    -> the attempt errored; re-claimable immediately
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed', 'completed', 'failed')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  -- Lease expiry. A claim past this is up for grabs again.
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  -- How many times this invoice has been claimed; a climbing count with no
  -- completion is the signal that something is wrong.
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One claim per invoice. This unique index is the whole mechanism: concurrent
-- claimants collide on it and exactly one wins.
CREATE UNIQUE INDEX billing_invoice_claims_invoice_idx
  ON billing_invoice_claims (organization_id, stripe_invoice_id);

CREATE INDEX billing_invoice_claims_period_idx
  ON billing_invoice_claims (billing_period_id);

ALTER TABLE billing_invoice_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_invoice_claims_tenant_isolation ON billing_invoice_claims
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON billing_invoice_claims TO flagon_app;
