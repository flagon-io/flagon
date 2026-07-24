-- plan_versions is now billing-only. Marketing copy moved to static content in
-- flagon's marketing pages (src/lib/marketing-plans.ts), so the public pages no
-- longer derive their plan set, names, taglines, or feature bullets from the
-- database. Drop the marketing columns; the price/entitlement version - the
-- substrate for grandfathering and scheduled repricing - stays.
--
-- Ships AFTER the code that stops selecting these columns (flagon marketing +
-- sudo pricing editor), so no deployed reader references them when they drop.
ALTER TABLE plan_versions
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS features,
  DROP COLUMN IF EXISTS listed,
  DROP COLUMN IF EXISTS highlight,
  DROP COLUMN IF EXISTS self_serve,
  DROP COLUMN IF EXISTS sort_order;
