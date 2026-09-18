-- Public profile fields on the user (mirrored from the app's BetterAuth, the
-- writer of the account). These back the GitHub-style public read endpoint
-- GET /users/{username}. All optional; username is unique (multiple NULLs are
-- fine - a user without a username just isn't publicly reachable by name).
ALTER TABLE public.users
	ADD COLUMN username     text UNIQUE,
	ADD COLUMN name         text,
	ADD COLUMN bio          text,
	ADD COLUMN pronouns     text,
	ADD COLUMN website_url  text,
	ADD COLUMN company      text,
	ADD COLUMN location     text,
	ADD COLUMN social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
	ADD COLUMN public_email text,
	ADD COLUMN avatar_url   text;

-- The public read window. users has RLS (users_self: a user sees only their own
-- row), which would block an unauthenticated public lookup. This function is
-- SECURITY DEFINER, so it runs as its owner (the migrator, which owns the table
-- and is RLS-exempt) and can read any row - but it returns ONLY public columns
-- (never the account email or private ids), so the base table's RLS stays intact
-- and nothing private can leak. search_path is pinned to defend the definer.
-- Default EXECUTE is PUBLIC, which is intentional: this IS the public surface.
CREATE OR REPLACE FUNCTION public.user_profile(p_username text)
	RETURNS TABLE (
		id           text,
		username     text,
		name         text,
		bio          text,
		pronouns     text,
		website_url  text,
		company      text,
		location     text,
		social_links jsonb,
		public_email text,
		avatar_url   text,
		created_at   timestamptz
	)
	LANGUAGE sql
	SECURITY DEFINER
	STABLE
	SET search_path = public
	AS $$
		SELECT id, username, name, bio, pronouns, website_url, company, location,
		       social_links, public_email, avatar_url, created_at
		FROM public.users
		WHERE username = p_username
	$$;

COMMENT ON FUNCTION public.user_profile(text) IS
	'Public, RLS-bypassing read of a user''s PUBLIC profile columns only. Backs GET /users/{username}.';
