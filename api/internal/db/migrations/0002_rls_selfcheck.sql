-- Built-in RLS self-check fixture. A tiny org-scoped table the API queries as
-- the app (RLS) role to prove tenant isolation is actually enforced end to end
-- (served at /internal/rls-check). Two rows for two sentinel orgs; the app role
-- must only ever see the row for the org bound to its transaction.
--
-- It lives in public (not the flagon helper schema) so a managed Postgres role
-- model that auto-grants the app role on public (e.g. Fly Managed Postgres,
-- where the API cannot GRANT to its own role) covers it without manual grants.

CREATE TABLE IF NOT EXISTS public.rls_selfcheck (
	org_id uuid PRIMARY KEY,
	tag    text NOT NULL
);

-- Seed before enabling RLS: the migrator is NOBYPASSRLS, so once FORCE is on it
-- could not insert rows that don't match a (not-yet-set) org context.
INSERT INTO public.rls_selfcheck (org_id, tag) VALUES
	('00000000-0000-0000-0000-0000000000a1', 'org-a'),
	('00000000-0000-0000-0000-0000000000b2', 'org-b')
ON CONFLICT (org_id) DO NOTHING;

ALTER TABLE public.rls_selfcheck ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rls_selfcheck FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_selfcheck_iso ON public.rls_selfcheck;
CREATE POLICY rls_selfcheck_iso ON public.rls_selfcheck
	USING (org_id = flagon.current_org())
	WITH CHECK (org_id = flagon.current_org());
