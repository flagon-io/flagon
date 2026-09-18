-- Organization audit log: an immutable, org-scoped record of who changed what.
-- This is a DISTINCT concern from user notifications (public.notifications, which
-- are per-recipient): the audit log belongs to the ORG and every member can read
-- the org's whole history. Features emit into it from their mutation paths.
CREATE TABLE public.audit_logs (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
	actor_id    text REFERENCES public.users(id) ON DELETE SET NULL, -- who did it (null once the user is gone)
	action      text NOT NULL,        -- machine key, e.g. "project.created"
	target_type text,                 -- "project" | "member" | "invitation" | "organization"
	target_id   text,                 -- slug/id of the affected thing
	summary     text NOT NULL,        -- human sentence (predicate), e.g. "created project Billing API"
	created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_idx ON public.audit_logs (org_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Members may read their org's audit log. There is deliberately NO insert/update/
-- delete policy: the log is append-only via the SECURITY DEFINER helper below, so
-- no runtime role can forge, alter, or erase history.
CREATE POLICY audit_logs_member_read ON public.audit_logs FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = audit_logs.org_id AND m.user_id = flagon.current_user_id()
	));

-- Append one entry, past the RLS insert restriction. SECURITY DEFINER (owner is
-- RLS-exempt); only reachable from our Go code, inside the actor's transaction so
-- the entry commits atomically with the change it records.
CREATE OR REPLACE FUNCTION flagon.record_audit(
	p_org_id      uuid,
	p_actor_id    text,
	p_action      text,
	p_target_type text,
	p_target_id   text,
	p_summary     text
)
	RETURNS uuid
	LANGUAGE sql
	SECURITY DEFINER
	SET search_path = public
	AS $$
		INSERT INTO public.audit_logs (org_id, actor_id, action, target_type, target_id, summary)
		VALUES (
			p_org_id,
			NULLIF(p_actor_id, ''),
			p_action,
			NULLIF(p_target_type, ''),
			NULLIF(p_target_id, ''),
			p_summary
		)
		RETURNING id
	$$;

-- Read an org's audit log with the actor's profile joined, but only when the
-- caller is a member (gate mirrors flagon.org_members). SECURITY DEFINER so the
-- actor join reaches the users table past its RLS. Newest first.
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
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY a.created_at DESC
		LIMIT p_limit
	$$;
