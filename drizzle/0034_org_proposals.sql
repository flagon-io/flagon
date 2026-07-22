-- Enterprise proposals: an offer of contract terms + a price, sent to a
-- prospect's decision-maker as a signed link they approve or decline.
--
-- GLOBAL, no RLS - like an emailed verification link, a proposal is read and
-- responded to by possession of an unguessable token BEFORE any org session
-- exists, so a tenant RLS policy (which needs app.current_org_id) would block
-- the very request that is supposed to reach it. Access control is the token:
-- only its SHA-256 digest is stored, and every lookup is a digest match in
-- application code (src/lib/proposals.server.ts). The raw token lives only in
-- the link. Managed (created/sent) by internal tooling as the owner; the app
-- role only ever needs to read one by digest and record the response.
--
-- The proposal carries the PRICE (base_fee_cents + interval) that org_contracts
-- deliberately does not - the contract is the agreed terms, the proposal is the
-- offer of terms AND price. On acceptance the operator provisions: price ->
-- Stripe subscription, terms -> org_contracts.

CREATE TABLE org_proposals (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- SHA-256 hex digest of the link token; the raw token is never stored.
  token_hash text NOT NULL UNIQUE,
  -- draft | sent | accepted | declined | expired | withdrawn | provisioned
  status text NOT NULL DEFAULT 'draft',
  term_start date NOT NULL,
  term_end date NOT NULL,
  -- Same shapes as org_contracts: covered term envelope, per-cycle metered
  -- included, negotiated overage rates. Quantity, never cents (except rates).
  meter_allowances jsonb NOT NULL DEFAULT '{}',
  metered_allowances jsonb NOT NULL DEFAULT '{}',
  metered_rates jsonb NOT NULL DEFAULT '{}',
  -- The offered base fee, per interval. 0 is valid (a fully-covered contract).
  base_fee_cents integer NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'year',
  -- A note shown to the recipient on the proposal page.
  message text,
  expires_at timestamptz,
  sent_at timestamptz,
  responded_at timestamptz,
  decline_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_proposals_term_valid CHECK (term_end >= term_start),
  CONSTRAINT org_proposals_status_valid CHECK (
    status IN ('draft','sent','accepted','declined','expired','withdrawn','provisioned')
  ),
  CONSTRAINT org_proposals_interval_valid CHECK (interval IN ('month','year'))
);

CREATE INDEX org_proposals_org_idx ON org_proposals (organization_id, created_at DESC);
CREATE INDEX org_proposals_status_idx ON org_proposals (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_proposals TO flagon_app;
