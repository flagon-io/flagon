-- Exposures default-on: remote (per-flag) evaluations on a client key auto-log a
-- billable exposure by default, deduped per session (see usage/auto-expose.ts). A
-- customer can turn it off per key. client_keys is an auth-layer table (no RLS), so
-- no policy change is needed for the new column.
ALTER TABLE "client_keys" ADD COLUMN "auto_expose" boolean DEFAULT true NOT NULL;
