-- Organization soft delete + restore.
--
-- orgs.deleted_at has existed since 0003, but nothing set it. This migration
-- makes a deleted org disappear for everyone at the tenancy root, instead of
-- patching every query: the membership predicates that RLS policies and the
-- SECURITY DEFINER helpers build on now treat a deleted org's memberships as
-- nonexistent. Every policy of the form EXISTS (SELECT 1 FROM memberships ...)
-- runs that subquery under the memberships policies, and every definer role
-- check goes through flagon.org_member_role, so a deleted org's projects,
-- members, teams, invitations, tokens and audit log all read as "not found" the
-- moment deleted_at is stamped, and come back unchanged on restore.

-- Slug uniqueness applies to live orgs only (the same rule projects follow since
-- 0014): a new org may take a deleted org's slug at once, and restoring an org
-- whose slug was taken meanwhile needs a new slug (the index rejects it).
ALTER TABLE public.orgs DROP CONSTRAINT orgs_slug_key;
CREATE UNIQUE INDEX orgs_slug_live_idx ON public.orgs (slug) WHERE deleted_at IS NULL;
CREATE INDEX orgs_deleted_at_idx ON public.orgs (deleted_at) WHERE deleted_at IS NOT NULL;

-- Whether an org exists and is not soft-deleted. Definer so RLS policies on
-- memberships can consult orgs without recursing through orgs' own policies
-- (which themselves read memberships).
CREATE OR REPLACE FUNCTION flagon.org_is_live(p_org_id uuid)
	RETURNS boolean
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT EXISTS (SELECT 1 FROM public.orgs WHERE id = p_org_id AND deleted_at IS NULL)
	$$;

-- A user's role in a LIVE org (NULL if not a member or the org is deleted). Every
-- role-gated policy (memberships_org_manage, access tokens, invitations, teams,
-- project grants) and the Go role checks go through this.
CREATE OR REPLACE FUNCTION flagon.org_member_role(p_org_id uuid, p_user_id text)
	RETURNS text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT m.role FROM public.memberships m
		JOIN public.orgs o ON o.id = m.org_id AND o.deleted_at IS NULL
		WHERE m.org_id = p_org_id AND m.user_id = p_user_id
	$$;

-- A member sees their own membership only while the org is live. With
-- memberships_org_manage (role-gated above) this hides every membership row of a
-- deleted org from the runtime role, so all membership-EXISTS policies fail.
DROP POLICY memberships_self ON public.memberships;
CREATE POLICY memberships_self ON public.memberships
	USING (user_id = flagon.current_user_id() AND flagon.org_is_live(org_id))
	WITH CHECK (user_id = flagon.current_user_id() AND flagon.org_is_live(org_id));

-- Bearer auth: an org access token (OAT) of a deleted org stops resolving, so it
-- is rejected at the door (401). Personal tokens have no org and are unaffected.
CREATE OR REPLACE FUNCTION flagon.resolve_access_token(p_hash text)
	RETURNS TABLE (principal_user_id text, email text, kind text, org_id uuid, scopes jsonb)
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	BEGIN
		UPDATE public.access_tokens t SET last_used_at = now()
		WHERE t.token_hash = p_hash
		  AND t.revoked_at IS NULL
		  AND (t.expires_at IS NULL OR t.expires_at > now())
		  AND (t.org_id IS NULL OR flagon.org_is_live(t.org_id));
		RETURN QUERY
			SELECT t.principal_user_id, u.email, t.kind, t.org_id, t.scopes
			FROM public.access_tokens t
			JOIN public.users u ON u.id = t.principal_user_id
			WHERE t.token_hash = p_hash
			  AND t.revoked_at IS NULL
			  AND (t.expires_at IS NULL OR t.expires_at > now())
			  AND (t.org_id IS NULL OR flagon.org_is_live(t.org_id));
	END;
	$$;

-- Accepting an invitation into a deleted org is "not found" (the landing-page
-- lookup, invitation_by_token, already hides it). Otherwise identical to 0030.
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
		IF p_user_id IS NULL OR p_user_id IS DISTINCT FROM flagon.current_user_id() THEN
			RAISE EXCEPTION 'accepting user is not the bound user' USING ERRCODE = 'invalid_authorization_specification';
		END IF;

		SELECT i.id, i.org_id, i.role, i.status, i.expires_at, i.email, i.invited_by
		INTO v_id, v_org, v_role, v_status, v_expires, v_email, v_inviter
		FROM public.org_invitations i
		JOIN public.orgs o ON o.id = i.org_id AND o.deleted_at IS NULL
		WHERE i.token_hash = p_token_hash
		FOR UPDATE OF i;

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

-- The human members of a live org, for notifying them when an owner deletes it.
-- Owners only, and bound to the transaction's RLS user (see 0030).
CREATE OR REPLACE FUNCTION flagon.org_human_member_ids(p_actor text, p_org_id uuid)
	RETURNS SETOF text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT m.user_id
		FROM public.memberships m
		JOIN public.users u ON u.id = m.user_id AND u.is_service = false
		WHERE m.org_id = p_org_id
		  AND p_actor = flagon.current_user_id()
		  AND flagon.org_member_role(p_org_id, p_actor) = 'owner'
	$$;

-- The caller's recently deleted orgs: those they OWNED when it was deleted,
-- deleted after p_since (the retention cutoff, decided by the Go layer). Definer
-- because the memberships of a deleted org are hidden from the runtime role.
CREATE OR REPLACE FUNCTION flagon.deleted_orgs(p_actor text, p_since timestamptz)
	RETURNS TABLE (id uuid, name text, slug text, created_at timestamptz, deleted_at timestamptz)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT o.id, o.name, o.slug, o.created_at, o.deleted_at
		FROM public.orgs o
		JOIN public.memberships m ON m.org_id = o.id AND m.user_id = p_actor AND m.role = 'owner'
		WHERE o.deleted_at IS NOT NULL AND o.deleted_at > p_since
		  AND p_actor = flagon.current_user_id()
		ORDER BY o.deleted_at DESC, o.id
	$$;

-- Restore a deleted org the caller owns, within retention. p_slug renames it on
-- the way back (NULL/'' keeps the old slug); the live-only unique index raises
-- unique_violation (23505) if that slug is taken. Raises P0002 (not found) when
-- there is no such restorable org and P0001 (forbidden) when the caller is a
-- member but not an owner. The Go layer checks the owned-org plan limit and
-- records the audit entry in the same transaction.
CREATE OR REPLACE FUNCTION flagon.restore_org(p_actor text, p_org_id uuid, p_slug text, p_since timestamptz)
	RETURNS TABLE (id uuid, name text, slug text, enforce_two_factor boolean, require_sso boolean, created_at timestamptz)
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	DECLARE
		v_slug text;
		v_role text;
	BEGIN
		IF p_actor IS NULL OR p_actor IS DISTINCT FROM flagon.current_user_id() THEN
			RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
		END IF;

		SELECT o.slug INTO v_slug FROM public.orgs o
		WHERE o.id = p_org_id AND o.deleted_at IS NOT NULL AND o.deleted_at > p_since
		FOR UPDATE;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
		END IF;

		SELECT m.role INTO v_role FROM public.memberships m
		WHERE m.org_id = p_org_id AND m.user_id = p_actor;
		IF v_role IS NULL THEN
			RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002';
		END IF;
		IF v_role <> 'owner' THEN
			RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
		END IF;

		UPDATE public.orgs o
		SET deleted_at = NULL, slug = COALESCE(NULLIF(p_slug, ''), v_slug), updated_at = now()
		WHERE o.id = p_org_id;

		RETURN QUERY
			SELECT o.id, o.name, o.slug, o.enforce_two_factor, o.require_sso, o.created_at
			FROM public.orgs o WHERE o.id = p_org_id;
	END;
	$$;

-- Stamp an org deleted. Definer because the stamped row no longer passes the orgs
-- SELECT policy (live orgs only), which Postgres also applies to an UPDATE's new
-- row. Owners only, bound to the transaction's RLS user. Returns the stamp, or
-- no row when there is no such live org or the caller is not its owner.
CREATE OR REPLACE FUNCTION flagon.delete_org(p_actor text, p_org_id uuid)
	RETURNS timestamptz
	LANGUAGE sql SECURITY DEFINER SET search_path = public
	AS $$
		UPDATE public.orgs o SET deleted_at = now(), updated_at = now()
		WHERE o.id = p_org_id AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND flagon.org_member_role(p_org_id, p_actor) = 'owner'
		RETURNING o.deleted_at
	$$;
