-- Bind the teams and team-members SECURITY DEFINER windows to the transaction's
-- RLS user, as 0030 did for the org members/invitations windows and 0034 for the
-- project and team-projects windows.
--
-- Both run as the schema owner (past RLS) and decided visibility only from the
-- p_actor argument, so they trusted whatever id the Go layer passed. Now p_actor
-- must ALSO equal flagon.current_user_id() - the id inUserTx binds - so the
-- definer window and RLS agree on who is asking, and an unbound or mismatched
-- call sees nothing. The Go callers (ListTeams and ListTeamMembers) already
-- run inside inUserTx.
--
-- Signatures and return types are unchanged (CREATE OR REPLACE keeps ownership
-- and grants), so existing callers keep working.

-- Teams -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION flagon.teams(p_actor text, p_org_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		id uuid, name text, slug text, description text, member_count int, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT t.id, t.name, t.slug, t.description,
			(SELECT count(*)::int FROM public.team_members tm WHERE tm.team_id = t.id),
			t.created_at,
			ARRAY[lower(t.name), t.id::text]
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR t.name ILIKE '%' || p_q || '%' OR t.slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(t.name), t.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(t.name), t.id::text
		LIMIT p_limit
	$$;

-- Team members ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION flagon.team_members(p_actor text, p_org_slug text, p_team_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		user_id text, name text, email text, username text, avatar_url text, role text, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, tm.role, tm.created_at,
		       ARRAY[lower(u.email), u.id]
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.slug = p_team_slug AND t.deleted_at IS NULL
		JOIN public.team_members tm ON tm.team_id = t.id
		JOIN public.users u ON u.id = tm.user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;
