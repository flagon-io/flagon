-- The quota counter follows the ORG'S BILLING WINDOW, not the calendar month.
--
-- 0024 keyed evaluation_counters on the UTC month, reasoning that a hard cap
-- has to be answerable in one indexed lookup and that capped orgs (Hobby) have
-- no subscription cycle to follow anyway. Both halves of that are still true,
-- but it left a trap: an org on an anniversary cycle would have its usage page
-- and invoice running the 19th to the 19th while its cap counted the 1st to
-- the 1st. Two different "this period" in one product is the exact confusion
-- billing-period.ts exists to prevent, and it would have surfaced the first
-- time any plan other than Hobby became capped.
--
-- Keying on the period START fixes it with no cost to the lookup: the key is
-- still one date, still one indexed probe. For an org with no subscription the
-- window IS the calendar month (see currentPeriodFor), so this is a pure
-- rename for every row that exists today and Hobby behaviour is unchanged.

ALTER TABLE evaluation_counters RENAME COLUMN period_month TO period_start;

-- The unique index follows the column automatically; renaming it too keeps the
-- catalog readable rather than leaving a name that describes the old grain.
ALTER INDEX evaluation_counters_unique_idx
  RENAME TO evaluation_counters_org_meter_period_idx;
