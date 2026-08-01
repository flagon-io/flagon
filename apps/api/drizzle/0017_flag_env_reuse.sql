-- Environment config reuse (the "Reuse" evaluation mode).
--
-- A flag's config in one environment can INHERIT another environment's config
-- (rules + default + enabled) instead of defining its own — Vercel-style "reuse
-- the configuration of another environment". This is the only one of the four
-- evaluation modes (Off / On / Rules / Reuse) that needs storage; Off/On/Rules
-- are derived from `enabled` + whether any rules exist, so they need no column.
--
-- Nullable and additive: existing flag_environments rows get NULL (no reuse), so
-- evaluation is unchanged until a flag is explicitly put in Reuse mode. On delete
-- of the source environment the reference clears (SET NULL), degrading safely to
-- the row's own config rather than dangling.
ALTER TABLE "flag_environments"
  ADD COLUMN "reuse_source_environment_id" uuid
  REFERENCES "environments"("id") ON DELETE SET NULL;
