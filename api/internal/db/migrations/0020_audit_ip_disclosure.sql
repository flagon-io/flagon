-- Actor IP disclosure is an explicit, opt-in org setting (GitHub's model, and
-- default OFF): IPs are always recorded, but only revealed in the audit log once
-- an owner/admin enables disclosure. Country and client are always shown; only
-- the raw IP is gated.
ALTER TABLE public.orgs
	ADD COLUMN audit_ip_disclosure boolean NOT NULL DEFAULT false;

-- org_audit: null out actor_ip unless the org has disclosure enabled. Same
-- signature/columns as before, so CREATE OR REPLACE suffices.
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
