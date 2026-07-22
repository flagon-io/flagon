-- Distinguish BILLED evaluations from app EXPOSURES in per-flag usage.
--
-- 0031 recorded per-flag usage only from the single-flag endpoint and the
-- client exposure hook, and treated it all as "checks". That left a gap the
-- billing page exposes: the BULK OFREP endpoint bills every flag in the config
-- it serves (quantity = flags.length), but those evaluations were never
-- attributed per flag - so a flag shows "no checks" while the invoice charges
-- for it. The per-flag view and the bill disagreed.
--
-- The fix is to record bulk evaluations per flag too, but keep two sources
-- apart so neither number lies:
--
--   served   billed evaluations - bulk (per flag) + single-flag. These SUM to
--            the org's billed evaluation quantity, so the per-flag view
--            reconciles with the invoice.
--   exposed  client-reported exposures (the OpenFeature hook): what the app
--            actually READ. Real usage, a different scale from billing, and the
--            honest signal for staleness ("billed on every fetch, never read").
--
-- Existing rows came from the single-flag bridge, which is a billed evaluation,
-- so 'served' is the correct default and needs no backfill.

ALTER TABLE flag_usage_rollups
  ADD COLUMN source text NOT NULL DEFAULT 'served'
    CHECK (source IN ('served', 'exposed'));

-- Source joins the grain: a bulk-served and a hook-exposed count for the same
-- (flag, hour, variant, reason) are distinct rows, summed apart at read time.
DROP INDEX flag_usage_rollups_grain_idx;
CREATE UNIQUE INDEX flag_usage_rollups_grain_idx
  ON flag_usage_rollups (
    organization_id, flag_key, hour, variant_key, reason, source
  );

ALTER TABLE flag_usage_daily
  ADD COLUMN source text NOT NULL DEFAULT 'served'
    CHECK (source IN ('served', 'exposed'));

DROP INDEX flag_usage_daily_grain_idx;
CREATE UNIQUE INDEX flag_usage_daily_grain_idx
  ON flag_usage_daily (organization_id, flag_key, day, variant_key, source);
