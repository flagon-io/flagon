-- Identity: app users (mirrored from the app's BetterAuth), the orgs they
-- explicitly create, and their memberships. Multi-tenancy is by org membership,
-- enforced with RLS against the app role (flagon_app, NOBYPASSRLS). Two
-- request-scoped context vars drive it: flagon.user_id (the authenticated app
-- user, set on every request) and flagon.org_id (the org being operated on, set
-- for org-scoped work - see 0001's flagon.current_org()).
--
-- RLS is ENABLEd, not FORCEd: the migrator (table owner) is only ever used by
-- `api migrate`, never at runtime, so leaving it exempt lets admin/migrations
-- work while the runtime role stays fully isolated.

CREATE OR REPLACE FUNCTION flagon.current_user_id() RETURNS text
	LANGUAGE sql
	STABLE
	AS $$ SELECT nullif(current_setting('flagon.user_id', true), '') $$;

COMMENT ON FUNCTION flagon.current_user_id() IS
	'App user id bound to the current transaction via set_config(''flagon.user_id'', ...); NULL when unset so policies fail closed.';

-- Users: a mirror of the app's BetterAuth user. id is BetterAuth's text id.
CREATE TABLE public.users (
	id         text PRIMARY KEY,
	email      text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON public.users
	USING (id = flagon.current_user_id())
	WITH CHECK (id = flagon.current_user_id());

-- Orgs: created explicitly by users, soft-deletable (GitHub-style restore).
CREATE TABLE public.orgs (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name       text NOT NULL,
	slug       text NOT NULL UNIQUE,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	deleted_at timestamptz
);
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

-- Memberships link a user to an org with a role (owner is set on creation).
CREATE TABLE public.memberships (
	org_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
	user_id    text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	role       text NOT NULL DEFAULT 'member',
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (org_id, user_id)
);
CREATE INDEX memberships_user_idx ON public.memberships (user_id);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_self ON public.memberships
	USING (user_id = flagon.current_user_id())
	WITH CHECK (user_id = flagon.current_user_id());

-- Any authenticated user may create an org; only its members can see or change
-- it. (Creation inserts the org, then the creator's owner membership, in one
-- transaction - after which orgs_member_select can see it.)
CREATE POLICY orgs_insert ON public.orgs FOR INSERT
	WITH CHECK (true);
CREATE POLICY orgs_member_select ON public.orgs FOR SELECT
	USING (deleted_at IS NULL AND EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = orgs.id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY orgs_member_modify ON public.orgs FOR UPDATE
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = orgs.id AND m.user_id = flagon.current_user_id()
	))
	WITH CHECK (true);
