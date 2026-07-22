-- Per-flag usage analytics: the exposure pipeline.
--
-- Billing (usage_rollups, 0016) answers "how much did this ORG evaluate" and is
-- deliberately aggregate. It cannot answer "which FLAGS does this app actually
-- use", because the bulk OFREP endpoint evaluates every flag on every poll - the
-- server sees them all identically. Real per-flag usage has to come from the
-- CLIENT reporting which flags it evaluated (exposure logging), exactly as
-- Statsig works.
--
-- These tables are where those exposures land and are aggregated. They carry the
-- served VARIANT and the REASON it was served (STATIC / TARGETING_MATCH / SPLIT),
-- which is what makes pass rate and targeting-mix analytics possible.
--
-- PRIVACY: nothing here stores a raw targeting identity. Rollups are pure counts
-- by outcome. The optional sample table keeps a SALTED hash for a short window so
-- the detail page can show a recent-exposures stream without ever persisting who
-- was exposed.
--
-- flag_key is a DIMENSION, not a foreign key (mirrors usage_rollups.project_id,
-- 0017): usage has to outlive a renamed or deleted flag, and history stays
-- readable under the key that produced it.

-- The analytics store, at HOURLY grain: fine enough for a checks/hr rate and a
-- recent sparkline, coarse enough that cardinality stays bounded
-- (flags x variants x reasons x hours).
CREATE TABLE flag_usage_rollups (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  -- Truncated to the hour (UTC). The client pre-aggregates to this grain before
  -- sending, so one batch touches few rows however many checks it represents.
  hour timestamptz NOT NULL,
  -- The served variant and why. STATIC = default, TARGETING_MATCH = a rule hit,
  -- SPLIT = a percentage rollout (see src/lib/flags.ts evaluateFlag).
  variant_key text NOT NULL,
  reason text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per (flag, hour, outcome): the ingest upsert adds onto it, so a
-- retried-but-not-deduped batch would double-count only within its own batch,
-- and the batch receipt below prevents even that.
CREATE UNIQUE INDEX flag_usage_rollups_grain_idx
  ON flag_usage_rollups (organization_id, flag_key, hour, variant_key, reason);

-- The read path: one flag's series, and every flag's recent window.
CREATE INDEX flag_usage_rollups_org_flag_hour_idx
  ON flag_usage_rollups (organization_id, flag_key, hour);

-- Long-term history and staleness, folded from the hourly rollups by the
-- compaction cron. Hourly rows are trimmed after a short window; this is kept
-- long, so "no checks in 30 days" survives hourly retention.
CREATE TABLE flag_usage_daily (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  day date NOT NULL,
  variant_key text NOT NULL,
  count bigint NOT NULL DEFAULT 0,
  -- The most recent moment this flag was seen at all, for staleness.
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX flag_usage_daily_grain_idx
  ON flag_usage_daily (organization_id, flag_key, day, variant_key);

CREATE INDEX flag_usage_daily_org_flag_day_idx
  ON flag_usage_daily (organization_id, flag_key, day);

-- Idempotency receipts. An exposure batch is pre-aggregated, so it has no
-- per-event key to dedupe on; the batch id is the unit. A replayed batch finds
-- its receipt and is dropped whole, before any count is applied.
CREATE TABLE flag_exposure_batches (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX flag_exposure_batches_receipt_idx
  ON flag_exposure_batches (organization_id, batch_id);

-- Sampled raw exposures for the detail page's "recent exposures" stream. A
-- diagnostics aid, not an analytics source (the rollups are that), so it is
-- sampled and short-lived. targeting_key_hash is a SALTED digest only - it lets
-- the stream say "a user" without ever saying which.
CREATE TABLE flag_exposure_samples (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  variant_key text NOT NULL,
  reason text NOT NULL,
  targeting_key_hash text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX flag_exposure_samples_org_flag_time_idx
  ON flag_exposure_samples (organization_id, flag_key, occurred_at DESC);

-- Product data: tenant-scoped, deny-by-default, queried through withTenant.
-- Same policy shape as drizzle/0017 for every table.
ALTER TABLE flag_usage_rollups ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_usage_rollups_tenant_isolation ON flag_usage_rollups
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE flag_usage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_usage_daily_tenant_isolation ON flag_usage_daily
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE flag_exposure_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_exposure_batches_tenant_isolation ON flag_exposure_batches
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

ALTER TABLE flag_exposure_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY flag_exposure_samples_tenant_isolation ON flag_exposure_samples
  FOR ALL
  TO flagon_app
  USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON flag_usage_rollups TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON flag_usage_daily TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON flag_exposure_batches TO flagon_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON flag_exposure_samples TO flagon_app;
