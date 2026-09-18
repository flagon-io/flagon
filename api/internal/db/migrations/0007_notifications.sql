-- User notifications. A notification belongs to its recipient (user_id) and may
-- reference an org for context. Read state is per-notification. Features across
-- the platform emit into this table so the in-product bell + notifications page
-- are populated from day one.
CREATE TABLE public.notifications (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id    text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	org_id     uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
	type       text NOT NULL,
	title      text NOT NULL,
	body       text,
	link       text,
	read_at    timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON public.notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- A user reads and marks read only their OWN notifications. There is deliberately
-- no INSERT/DELETE policy for the runtime app role: notifications are created via
-- the SECURITY DEFINER helper below, so one user (the actor) can create a
-- notification for another (the recipient) without being able to read theirs.
CREATE POLICY notifications_read ON public.notifications FOR SELECT
	USING (user_id = flagon.current_user_id());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE
	USING (user_id = flagon.current_user_id())
	WITH CHECK (user_id = flagon.current_user_id());

-- Creates a notification for any recipient, past the RLS insert restriction.
-- SECURITY DEFINER (owner is RLS-exempt); only reachable from our Go code.
CREATE OR REPLACE FUNCTION flagon.create_notification(
	p_user_id text,
	p_org_id  uuid,
	p_type    text,
	p_title   text,
	p_body    text,
	p_link    text
)
	RETURNS uuid
	LANGUAGE sql
	SECURITY DEFINER
	SET search_path = public
	AS $$
		INSERT INTO public.notifications (user_id, org_id, type, title, body, link)
		VALUES (p_user_id, p_org_id, p_type, p_title, NULLIF(p_body, ''), NULLIF(p_link, ''))
		RETURNING id
	$$;
