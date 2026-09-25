-- Keep token service accounts out of the org member list.
--
-- Org access tokens act through a service-account user that holds a membership
-- (0009_access_tokens), and 0009 filtered those accounts out of org_members with
-- `u.is_service = false`. The pagination rewrite in 0028 rebuilt the function and
-- dropped that predicate, so every org token's service account showed up as a
-- "member" on the People page and in list_members. This restores the filter on
-- top of the 0030 definition (actor bound to the transaction's RLS user).
--
-- Signature and return type are unchanged (CREATE OR REPLACE keeps ownership and
-- grants).

CREATE OR REPLACE FUNCTION flagon.org_members(p_actor text, p_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		user_id text, name text, email text, username text, avatar_url text, role text, joined_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, m.role, m.created_at,
		       ARRAY[lower(u.email), u.id]
		FROM public.orgs o
		JOIN public.memberships m ON m.org_id = o.id
		JOIN public.users u ON u.id = m.user_id
		WHERE o.slug = p_slug AND o.deleted_at IS NULL AND u.is_service = false
		  AND p_actor = flagon.current_user_id()
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;
