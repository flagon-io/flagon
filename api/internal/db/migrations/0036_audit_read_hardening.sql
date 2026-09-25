-- Harden the org audit read window (flagon.org_audit).
--
-- 1. Bind the caller to the transaction's RLS user, as 0030 did for the other
--    SECURITY DEFINER windows: p_actor must ALSO equal flagon.current_user_id(),
--    so the owner/admin gate checks the user the transaction is bound to rather
--    than trusting an id passed as a plain argument. An unbound or mismatched
--    call sees nothing. The Go reader (audit.Store.List) now runs inside a
--    transaction that binds the user first.
--
-- 2. Stop the search from matching hidden IPs. Since 0020 the actor IP is only
--    returned when the org enables IP disclosure, but the search still matched
--    against it, so an admin could probe an undisclosed IP by searching for
--    candidate values and watching which rows came back. The IP column is now
--    searched only when disclosure is on.
--
-- Signature and return columns are unchanged (CREATE OR REPLACE keeps ownership
-- and grants), so existing callers keep working.
CREATE OR REPLACE FUNCTION flagon.org_audit(
	p_actor        text,
	p_slug         text,
	p_limit        int,
	p_query        text,
	p_actions      text[],
	p_actor_filter text,
	p_before_ts    timestamptz,
	p_before_id    uuid
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
		       CASE WHEN o.audit_ip_disclosure THEN a.actor_ip ELSE NULL END,
		       a.actor_country, a.actor_user_agent, a.created_at
		FROM public.orgs o
		JOIN public.audit_logs a ON a.org_id = o.id
		LEFT JOIN public.users u ON u.id = a.actor_id
		WHERE o.slug = p_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
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
			OR (o.audit_ip_disclosure AND COALESCE(a.actor_ip, '') ILIKE '%' || p_query || '%')
		  )
		  AND (p_before_ts IS NULL OR (a.created_at, a.id) < (p_before_ts, p_before_id))
		ORDER BY a.created_at DESC, a.id DESC
		LIMIT p_limit
	$$;
