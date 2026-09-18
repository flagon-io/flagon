-- The audit log is for org OWNERS and ADMINS only, following GitHub (it is not
-- visible to every member). Tighten both the read function and the RLS read
-- policy to the org's owners/admins. Writes are unchanged (any actor's mutation
-- records itself via the SECURITY DEFINER helper).
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
		created_at     timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT a.id, a.actor_id, u.name, u.email, u.username, u.avatar_url,
		       a.action, a.target_type, a.target_id, a.summary, a.created_at
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

DROP POLICY audit_logs_member_read ON public.audit_logs;

CREATE POLICY audit_logs_admin_read ON public.audit_logs FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = audit_logs.org_id
		  AND m.user_id = flagon.current_user_id()
		  AND m.role IN ('owner', 'admin')
	));
