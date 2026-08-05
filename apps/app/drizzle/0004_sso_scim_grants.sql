-- Grant the restricted runtime app role (flagon_app) full CRUD on the tables
-- added in migration 0003 (SSO / SCIM / 2FA).
--
-- 0003 CREATED those tables but did not grant them, so the non-owner app + API
-- role hit "permission denied for table scim_tokens" (and would on the others).
-- These are auth-layer tables (not tenant-RLS scoped), so they take direct
-- grants exactly like the rest of the auth schema (see the grant block in
-- 0000_auth). This is a separate migration because 0003 has already applied in
-- production; editing 0003 would not re-run.
--
-- Guarded on role existence so single-role local dev (which connects as the
-- owner, role `flagon`, not `flagon_app`) is a clean no-op — which is why this
-- gap did not surface locally.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flagon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
      "sso_providers", "two_factors", "org_sso_sessions",
      "scim_tokens", "scim_users", "scim_groups"
      TO flagon_app;
  END IF;
END $$;
