-- Full-featured audit read: search, action + actor filters, and keyset
-- pagination (newest first). Still owners/admins only, still a SECURITY DEFINER
-- window so the actor-profile join reaches past the users table's RLS. The Go
-- audit.Store drives it; callers ask for limit+1 rows to detect a next page.
DROP FUNCTION flagon.org_audit(text, text, int);

CREATE OR REPLACE FUNCTION flagon.org_audit(
	p_actor        text,          -- the caller (admin/owner gate)
	p_slug         text,
	p_limit        int,
	p_query        text,          -- '' = no search
	p_actions      text[],        -- NULL = all actions
	p_actor_filter text,          -- '' = any actor
	p_before_ts    timestamptz,   -- NULL = first (newest) page
	p_before_id    uuid           -- keyset tiebreak, paired with p_before_ts
)
	RETURNS TABLE (
		id             uuid,
		actor_id       text,
		actor_name     text,
		actor_email    text,
		actor_username text,
		actor_avatar   text,
		action         text,
		target_type    text,
		target_id      text,
		summary        text,
		actor_ip       text,
		actor_country  text,
		actor_ua       text,
		created_at     timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT a.id, a.actor_id, u.name, u.email, u.username, u.avatar_url,
		       a.action, a.target_type, a.target_id, a.summary,
		       a.actor_ip, a.actor_country, a.actor_user_agent, a.created_at
		FROM public.orgs o
		JOIN public.audit_logs a ON a.org_id = o.id
		LEFT JOIN public.users u ON u.id = a.actor_id
		WHERE o.slug = p_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am
			WHERE am.org_id = o.id AND am.user_id = p_actor
			  AND am.role IN ('owner', 'admin')
		  )
		  AND (p_actions IS NULL OR a.action = ANY(p_actions))
		  AND (COALESCE(p_actor_filter, '') = '' OR a.actor_id = p_actor_filter)
		  AND (
			COALESCE(p_query, '') = ''
			OR a.summary ILIKE '%' || p_query || '%'
			OR a.action ILIKE '%' || p_query || '%'
			OR COALESCE(u.username, '') ILIKE '%' || p_query || '%'
			OR COALESCE(u.email, '') ILIKE '%' || p_query || '%'
			OR COALESCE(a.actor_country, '') ILIKE '%' || p_query || '%'
			OR COALESCE(a.actor_ip, '') ILIKE '%' || p_query || '%'
		  )
		  AND (p_before_ts IS NULL OR (a.created_at, a.id) < (p_before_ts, p_before_id))
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT p_limit
	$$;
