-- Naming convention: plural table names, matching organizations / projects /
-- user_emails. Renames the BetterAuth defaults (and rate_limit) in place;
-- data, foreign keys, and defaults follow automatically. As a bonus, "users"
-- is not a reserved word, so no more quoting "user" in raw SQL.
--
-- BetterAuth is pointed at the new names via modelName overrides in
-- src/lib/auth.ts. Historical constraint/index names are left as-is.

ALTER TABLE "user" RENAME TO users;
ALTER TABLE session RENAME TO sessions;
ALTER TABLE account RENAME TO accounts;
ALTER TABLE verification RENAME TO verifications;
ALTER TABLE rate_limit RENAME TO rate_limits;
