-- Tighten the public profile read (GET /users/{username}, which is unauthenticated):
--   * never expose service principals (OAT machine users, is_service = true);
--   * never expose soft-deleted accounts.
-- Human deletion is decided app-side (BetterAuth); the app mirrors it here via
-- PUT /me/deleted so this public read has a deleted_at to filter on.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

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
		  AND is_service = false
		  AND deleted_at IS NULL
	$$;
