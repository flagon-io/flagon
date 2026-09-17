-- Tenant context for row-level security.
--
-- Every request that touches tenant data binds the active org to its
-- transaction once:
--
--     SELECT set_config('flagon.org_id', $org_uuid, true);  -- true => tx-local
--
-- and RLS policies on tenant tables reference flagon.current_org() in their
-- USING / WITH CHECK clauses. Defining the accessor here means the isolation
-- rule lives in exactly one migration-tracked place, identical across every
-- environment, rather than being re-spelled in each policy.
--
-- The app (runtime) role is NOBYPASSRLS, so these policies bind it
-- unconditionally. current_org() is STABLE and returns NULL when unset, so a
-- policy written as `org_id = flagon.current_org()` fails closed (matches no
-- rows) if a caller forgets to set the context.

CREATE SCHEMA IF NOT EXISTS flagon;

COMMENT ON SCHEMA flagon IS 'Flagon internal helpers (tenant context for RLS, etc).';

CREATE OR REPLACE FUNCTION flagon.current_org() RETURNS uuid
	LANGUAGE sql
	STABLE
	AS $$
		SELECT nullif(current_setting('flagon.org_id', true), '')::uuid
	$$;

COMMENT ON FUNCTION flagon.current_org() IS
	'Org bound to the current transaction via set_config(''flagon.org_id'', ...); NULL when unset so RLS policies fail closed.';
