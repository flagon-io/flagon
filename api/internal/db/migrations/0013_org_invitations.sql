-- Org invitations: invite a person by email who does not yet have a Flagon
-- account. Existing users are added to an org directly (see AddMember); an
-- invitation is for the not-yet-registered case. It is stored pending; accepting
-- it (by registering with that email, or as an already-signed-in user whose
-- email matches) joins the person to the org. Possession of the single-use token
-- is the proof of email control, so accepting an invitation is itself a form of
-- email verification.
--
-- Enforcement is layered like memberships: RLS gates who may see or manage an
-- org's invitations at all; the Go layer applies the role rules on top. The
-- token-based lookup and acceptance run before the invitee has any session, so
-- they go through SECURITY DEFINER helpers (the same safe pattern used for
-- co-member reads and public profiles).

CREATE TABLE public.org_invitations (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
	email       text NOT NULL,
	role        text NOT NULL DEFAULT 'member',
	token_hash  text NOT NULL UNIQUE,
	status      text NOT NULL DEFAULT 'pending',
	invited_by  text REFERENCES public.users(id) ON DELETE SET NULL,
	accepted_by text REFERENCES public.users(id) ON DELETE SET NULL,
	expires_at  timestamptz NOT NULL,
	created_at  timestamptz NOT NULL DEFAULT now(),
	accepted_at timestamptz,
	CONSTRAINT org_invitations_role_check CHECK (role IN ('admin', 'member', 'viewer')),
	CONSTRAINT org_invitations_status_check CHECK (status IN ('pending', 'accepted', 'revoked'))
);
-- At most one pending invite per (org, email); accepted/revoked rows are history.
CREATE UNIQUE INDEX org_invitations_pending_uq
	ON public.org_invitations (org_id, lower(email)) WHERE status = 'pending';
CREATE INDEX org_invitations_org_idx ON public.org_invitations (org_id);

ALTER TABLE public.org_invitations ENABLE ROW LEVEL SECURITY;

-- Any member of the org may read its invitations; only owners/admins may create
-- or modify (revoke) them. The Go layer still enforces the role hierarchy. These
-- mirror the memberships policies.
CREATE POLICY org_invitations_member_read ON public.org_invitations FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = org_invitations.org_id AND m.user_id = flagon.current_user_id()
	));
CREATE POLICY org_invitations_manage ON public.org_invitations FOR ALL
	USING (flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'))
	WITH CHECK (flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'));

-- Pending invitations for an org, with the inviter's display name, but only when
-- the caller (p_actor) is a member. Definer, so members see the inviter's name
-- past the users_self RLS - mirroring flagon.org_members.
CREATE OR REPLACE FUNCTION flagon.org_invitations(p_actor text, p_slug text)
	RETURNS TABLE (
		id         uuid,
		email      text,
		role       text,
		status     text,
		inviter    text,
		expires_at timestamptz,
		created_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT i.id, i.email, i.role, i.status,
		       COALESCE(u.name, u.username, u.email), i.expires_at, i.created_at
		FROM public.orgs o
		JOIN public.org_invitations i ON i.org_id = o.id
		LEFT JOIN public.users u ON u.id = i.invited_by
		WHERE o.slug = p_slug AND o.deleted_at IS NULL AND i.status = 'pending'
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY i.created_at DESC
	$$;

-- Look up an invitation by its token hash, with org context, for the invite
-- landing page. Definer, because it is reached before the invitee has any
-- account or session. Returns no rows for an unknown token; callers must treat a
-- non-pending or expired invite (both surfaced) as unusable.
CREATE OR REPLACE FUNCTION flagon.invitation_by_token(p_token_hash text)
	RETURNS TABLE (
		id        uuid,
		org_slug  text,
		org_name  text,
		email     text,
		role      text,
		status    text,
		expired   boolean,
		inviter   text
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT i.id, o.slug, o.name, i.email, i.role, i.status,
		       (i.expires_at <= now()) AS expired,
		       COALESCE(u.name, u.username, u.email)
		FROM public.org_invitations i
		JOIN public.orgs o ON o.id = i.org_id AND o.deleted_at IS NULL
		LEFT JOIN public.users u ON u.id = i.invited_by
		WHERE i.token_hash = p_token_hash
	$$;

-- Accept an invitation: validate it is pending, unexpired, and addressed to the
-- accepting user's email, then join them to the org (idempotent) and mark the
-- invite accepted. Definer, because the accepting user is not yet a member and
-- cannot see the org or the invitation under RLS. Ensures the user's mirror row
-- exists so the membership FK holds even if profile mirroring has not run yet.
-- Raises with SQLSTATEs the Go layer maps to friendly errors.
CREATE OR REPLACE FUNCTION flagon.accept_invitation(
	p_user_id text, p_email text, p_token_hash text
)
	RETURNS TABLE (org_slug text, org_name text, invited_by text)
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	DECLARE
		v_id uuid; v_org uuid; v_role text; v_status text;
		v_expires timestamptz; v_email text; v_inviter text;
	BEGIN
		SELECT i.id, i.org_id, i.role, i.status, i.expires_at, i.email, i.invited_by
		INTO v_id, v_org, v_role, v_status, v_expires, v_email, v_inviter
		FROM public.org_invitations i
		WHERE i.token_hash = p_token_hash
		FOR UPDATE;

		IF NOT FOUND THEN
			RAISE EXCEPTION 'invitation not found' USING ERRCODE = 'no_data_found';
		END IF;
		IF v_status <> 'pending' THEN
			RAISE EXCEPTION 'invitation is no longer pending' USING ERRCODE = 'invalid_parameter_value';
		END IF;
		IF v_expires <= now() THEN
			RAISE EXCEPTION 'invitation has expired' USING ERRCODE = 'invalid_parameter_value';
		END IF;
		IF lower(v_email) <> lower(p_email) THEN
			RAISE EXCEPTION 'invitation is addressed to a different email' USING ERRCODE = 'insufficient_privilege';
		END IF;

		INSERT INTO public.users (id, email) VALUES (p_user_id, p_email)
		ON CONFLICT (id) DO NOTHING;

		INSERT INTO public.memberships (org_id, user_id, role)
		VALUES (v_org, p_user_id, v_role)
		ON CONFLICT (org_id, user_id) DO NOTHING;

		UPDATE public.org_invitations
		SET status = 'accepted', accepted_at = now(), accepted_by = p_user_id
		WHERE id = v_id;

		RETURN QUERY
			SELECT o.slug, o.name, v_inviter FROM public.orgs o WHERE o.id = v_org;
	END;
	$$;
