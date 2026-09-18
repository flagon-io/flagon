-- Add the "where" to the audit log's who/what/when: the actor's IP, country, and
-- user-agent at the time of the change (all nullable - locally or over some
-- transports we may not have them). The app gateway forwards the end user's
-- client IP/country/UA; direct API/MCP calls use the connection's own headers.
ALTER TABLE public.audit_logs
	ADD COLUMN actor_ip         text,
	ADD COLUMN actor_country    text,
	ADD COLUMN actor_user_agent text;

-- record_audit gains the three context fields. Drop the old signature and
-- recreate; the write path is still funneled through this one SECURITY DEFINER
-- helper so nothing can append to the log directly.
DROP FUNCTION flagon.record_audit(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION flagon.record_audit(
	p_org_id      uuid,
	p_actor_id    text,
	p_action      text,
	p_target_type text,
	p_target_id   text,
	p_summary     text,
	p_ip          text,
	p_country     text,
	p_user_agent  text
)
	RETURNS uuid
	LANGUAGE sql
	SECURITY DEFINER
	SET search_path = public
	AS $$
		INSERT INTO public.audit_logs (
			org_id, actor_id, action, target_type, target_id, summary,
			actor_ip, actor_country, actor_user_agent
		)
		VALUES (
			p_org_id,
			NULLIF(p_actor_id, ''),
			p_action,
			NULLIF(p_target_type, ''),
			NULLIF(p_target_id, ''),
			p_summary,
			NULLIF(p_ip, ''),
			NULLIF(p_country, ''),
			NULLIF(p_user_agent, '')
		)
		RETURNING id
	$$;

-- org_audit returns the new fields too. The RETURNS TABLE shape changes, so it
-- must be dropped and recreated (owners/admins only, unchanged gate).
DROP FUNCTION flagon.org_audit(text, text, int);

CREATE OR REPLACE FUNCTION flagon.org_audit(p_actor text, p_slug text, p_limit int)
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
		ORDER BY a.created_at DESC
		LIMIT p_limit
	$$;
