-- Server-side search + keyset pagination for every SECURITY DEFINER list helper.
-- Each function gains three params: p_q (free-text search, '' = no filter), p_limit
-- (row cap - callers pass page size + 1 to detect a next page), and p_cursor (the
-- ordered sort-key values of the last row on the previous page, NULL = first page).
-- The sort switches to a stable UNIQUE key (a human column plus the id) so keyset
-- pagination is correct; Postgres row-value comparison ((a,b) > (c,d)) expresses the
-- keyset predicate directly. The old two/three-arg signatures are dropped (only the
-- Go layer called them, and it moves to the new signatures in lockstep).

-- Org members -------------------------------------------------------------------
DROP FUNCTION IF EXISTS flagon.org_members(text, text);
CREATE FUNCTION flagon.org_members(p_actor text, p_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		user_id text, name text, email text, username text, avatar_url text, role text, joined_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, m.role, m.created_at
		FROM public.orgs o
		JOIN public.memberships m ON m.org_id = o.id
		JOIN public.users u ON u.id = m.user_id
		WHERE o.slug = p_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;

-- Org invitations (pending) -----------------------------------------------------
DROP FUNCTION IF EXISTS flagon.org_invitations(text, text);
CREATE FUNCTION flagon.org_invitations(p_actor text, p_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		id uuid, email text, role text, status text, inviter text, expires_at timestamptz, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT i.id, i.email, i.role, i.status,
		       COALESCE(u.name, u.username, u.email), i.expires_at, i.created_at
		FROM public.orgs o
		JOIN public.org_invitations i ON i.org_id = o.id
		LEFT JOIN public.users u ON u.id = i.invited_by
		WHERE o.slug = p_slug AND o.deleted_at IS NULL AND i.status = 'pending'
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR i.email ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(i.email), i.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(i.email), i.id::text
		LIMIT p_limit
	$$;

-- Project collaborators ---------------------------------------------------------
DROP FUNCTION IF EXISTS flagon.project_members(text, text, text);
CREATE FUNCTION flagon.project_members(p_actor text, p_org_slug text, p_project_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		user_id text, name text, email text, username text, avatar_url text, role text, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, pm.role, pm.created_at
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_members pm ON pm.project_id = p.id
		JOIN public.users u ON u.id = pm.user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;

-- Teams -------------------------------------------------------------------------
DROP FUNCTION IF EXISTS flagon.teams(text, text);
CREATE FUNCTION flagon.teams(p_actor text, p_org_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		id uuid, name text, slug text, description text, member_count int, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT t.id, t.name, t.slug, t.description,
			(SELECT count(*)::int FROM public.team_members tm WHERE tm.team_id = t.id),
			t.created_at
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR t.name ILIKE '%' || p_q || '%' OR t.slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(t.name), t.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(t.name), t.id::text
		LIMIT p_limit
	$$;

-- Team members ------------------------------------------------------------------
DROP FUNCTION IF EXISTS flagon.team_members(text, text, text);
CREATE FUNCTION flagon.team_members(p_actor text, p_org_slug text, p_team_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		user_id text, name text, email text, username text, avatar_url text, role text, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, tm.role, tm.created_at
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.slug = p_team_slug AND t.deleted_at IS NULL
		JOIN public.team_members tm ON tm.team_id = t.id
		JOIN public.users u ON u.id = tm.user_id
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;

-- Project team grants -----------------------------------------------------------
DROP FUNCTION IF EXISTS flagon.project_teams(text, text, text);
CREATE FUNCTION flagon.project_teams(p_actor text, p_org_slug text, p_project_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		team_id uuid, name text, slug text, role text, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT t.id, t.name, t.slug, ptm.role, ptm.created_at
		FROM public.orgs o
		JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
		JOIN public.project_team_members ptm ON ptm.project_id = p.id
		JOIN public.teams t ON t.id = ptm.team_id AND t.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR t.name ILIKE '%' || p_q || '%' OR t.slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(t.name), t.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(t.name), t.id::text
		LIMIT p_limit
	$$;

-- Project owners (users + teams) ------------------------------------------------
DROP FUNCTION IF EXISTS flagon.project_owners(text, text, text);
CREATE FUNCTION flagon.project_owners(p_actor text, p_org_slug text, p_project_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		owner_type text, principal_id text, name text, email text, username text, avatar_url text, team_slug text, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT * FROM (
			SELECT 'user'::text AS owner_type, u.id AS principal_id, u.name, u.email, u.username, u.avatar_url, NULL::text AS team_slug, po.created_at
			FROM public.orgs o
			JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
			JOIN public.project_owners po ON po.project_id = p.id AND po.owner_user_id IS NOT NULL
			JOIN public.users u ON u.id = po.owner_user_id
			WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
			  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
			UNION ALL
			SELECT 'team'::text, t.id::text, t.name, NULL::text, NULL::text, NULL::text, t.slug, po.created_at
			FROM public.orgs o
			JOIN public.projects p ON p.org_id = o.id AND p.slug = p_project_slug AND p.deleted_at IS NULL
			JOIN public.project_owners po ON po.project_id = p.id AND po.owner_team_id IS NOT NULL
			JOIN public.teams t ON t.id = po.owner_team_id AND t.deleted_at IS NULL
			WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
			  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		) owners
		WHERE (p_q = '' OR name ILIKE '%' || p_q || '%' OR email ILIKE '%' || p_q || '%'
			OR username ILIKE '%' || p_q || '%' OR team_slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (owner_type, lower(COALESCE(name, '')), principal_id) > (p_cursor[1], p_cursor[2], p_cursor[3]))
		ORDER BY owner_type, lower(COALESCE(name, '')), principal_id
		LIMIT p_limit
	$$;

-- Team projects (a team's project access) ---------------------------------------
DROP FUNCTION IF EXISTS flagon.team_projects(text, text, text);
CREATE FUNCTION flagon.team_projects(p_actor text, p_org_slug text, p_team_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		project_id uuid, name text, slug text, role text, created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT p.id, p.name, p.slug, ptm.role, ptm.created_at
		FROM public.orgs o
		JOIN public.teams t ON t.org_id = o.id AND t.slug = p_team_slug AND t.deleted_at IS NULL
		JOIN public.project_team_members ptm ON ptm.team_id = t.id
		JOIN public.projects p ON p.id = ptm.project_id AND p.deleted_at IS NULL
		WHERE o.slug = p_org_slug AND o.deleted_at IS NULL
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR p.name ILIKE '%' || p_q || '%' OR p.slug ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(p.name), p.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(p.name), p.id::text
		LIMIT p_limit
	$$;
