-- Bind the SECURITY DEFINER windows that act "as" a caller to the transaction's
-- RLS user, instead of trusting an actor id passed as a plain argument.
--
-- These helpers run as the schema owner (past RLS) and decide what to return by
-- checking the caller's membership. Before, that check used only the p_actor /
-- p_user_id argument, so the function trusted whatever id the Go layer handed
-- it; a bug that passed the wrong id would have read another tenant's rows. Now
-- the argument must ALSO equal flagon.current_user_id() - the id bound to the
-- transaction by inUserTx - so the definer window and RLS agree on who is asking,
-- and an unbound (or mismatched) call sees nothing. The Go callers
-- (ListMembers, ListInvitations, AcceptInvitation) now run inside inUserTx.
--
-- Signatures and return types are unchanged (CREATE OR REPLACE keeps ownership
-- and grants), so existing callers keep working.

-- Org members -------------------------------------------------------------------
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
		WHERE o.slug = p_slug AND o.deleted_at IS NULL
		  AND p_actor = flagon.current_user_id()
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR u.name ILIKE '%' || p_q || '%' OR u.email ILIKE '%' || p_q || '%' OR u.username ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(u.email), u.id) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(u.email), u.id
		LIMIT p_limit
	$$;

-- Org invitations (pending) -----------------------------------------------------
CREATE OR REPLACE FUNCTION flagon.org_invitations(p_actor text, p_slug text, p_q text, p_limit int, p_cursor text[])
	RETURNS TABLE (
		id uuid, email text, role text, status text, inviter text, expires_at timestamptz, created_at timestamptz, sort_key text[]
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT i.id, i.email, i.role, i.status,
		       COALESCE(u.name, u.username, u.email), i.expires_at, i.created_at,
		       ARRAY[lower(i.email), i.id::text]
		FROM public.orgs o
		JOIN public.org_invitations i ON i.org_id = o.id
		LEFT JOIN public.users u ON u.id = i.invited_by
		WHERE o.slug = p_slug AND o.deleted_at IS NULL AND i.status = 'pending'
		  AND p_actor = flagon.current_user_id()
		  AND EXISTS (SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor)
		  AND (p_q = '' OR i.email ILIKE '%' || p_q || '%')
		  AND (p_cursor IS NULL OR (lower(i.email), i.id::text) > (p_cursor[1], p_cursor[2]))
		ORDER BY lower(i.email), i.id::text
		LIMIT p_limit
	$$;

-- Accept an invitation ------------------------------------------------------------
-- Same behavior as 0013, plus: the accepting user must be the user bound to the
-- transaction. A mismatch raises invalid_authorization_specification (28000),
-- which the Go layer maps to ErrForbidden.
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
