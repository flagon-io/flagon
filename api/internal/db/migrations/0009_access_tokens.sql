-- Access tokens (PAT + OAT) and a stronger org role ladder.

-- Fourth role: viewer (read-only), below member. owner > admin > member > viewer.
ALTER TABLE public.memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE public.memberships ADD CONSTRAINT memberships_role_check
	CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- Flag machine/service principals (the identity an OAT acts as). They are NOT
-- real people: excluded from human member lists, not tied to any user, and they
-- survive the removal of whoever created the token.
ALTER TABLE public.users ADD COLUMN is_service boolean NOT NULL DEFAULT false;

-- Human member list excludes service principals.
CREATE OR REPLACE FUNCTION flagon.org_members(p_actor text, p_slug text)
	RETURNS TABLE (
		user_id text, name text, email text, username text,
		avatar_url text, role text, joined_at timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, m.role, m.created_at
		FROM public.orgs o
		JOIN public.memberships m ON m.org_id = o.id
		JOIN public.users u ON u.id = m.user_id
		WHERE o.slug = p_slug AND o.deleted_at IS NULL AND u.is_service = false
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC,
		         (m.role = 'member') DESC, lower(u.email)
	$$;

-- Tokens. The secret is stored only as a sha256 hash. A PAT acts as its creating
-- user (org_id NULL); an OAT acts as a service principal scoped to org_id.
-- scopes is reserved for future fine-grained permissions (NULL = the principal's
-- full role today).
CREATE TABLE public.access_tokens (
	id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	kind              text NOT NULL CHECK (kind IN ('pat', 'oat')),
	name              text NOT NULL,
	token_hash        text NOT NULL UNIQUE,
	token_prefix      text NOT NULL,
	principal_user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	org_id            uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
	created_by        text REFERENCES public.users(id) ON DELETE SET NULL,
	scopes            jsonb,
	expires_at        timestamptz,
	last_used_at      timestamptz,
	revoked_at        timestamptz,
	created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_tokens_principal_idx ON public.access_tokens (principal_user_id);
CREATE INDEX access_tokens_org_idx ON public.access_tokens (org_id) WHERE org_id IS NOT NULL;

ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;
-- PAT: your own. OAT: owner/admin of its org (machine tokens are admin-managed).
CREATE POLICY access_tokens_select ON public.access_tokens FOR SELECT USING (
	(kind = 'pat' AND created_by = flagon.current_user_id())
	OR (kind = 'oat' AND flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'))
);
-- PAT: manage your own. OAT: owner/admin of the org (the Go layer double-checks).
CREATE POLICY access_tokens_manage ON public.access_tokens FOR ALL USING (
	(kind = 'pat' AND created_by = flagon.current_user_id())
	OR (kind = 'oat' AND flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'))
) WITH CHECK (
	(kind = 'pat' AND created_by = flagon.current_user_id())
	OR (kind = 'oat' AND flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'))
);

-- Bearer auth: resolve a presented token by its hash. Returns the principal +
-- context iff the token is live (not revoked/expired) and stamps last_used_at.
-- SECURITY DEFINER because the request is not yet authenticated.
CREATE OR REPLACE FUNCTION flagon.resolve_access_token(p_hash text)
	RETURNS TABLE (principal_user_id text, email text, kind text, org_id uuid)
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	BEGIN
		UPDATE public.access_tokens t SET last_used_at = now()
		WHERE t.token_hash = p_hash
		  AND t.revoked_at IS NULL
		  AND (t.expires_at IS NULL OR t.expires_at > now());
		RETURN QUERY
			SELECT t.principal_user_id, u.email, t.kind, t.org_id
			FROM public.access_tokens t
			JOIN public.users u ON u.id = t.principal_user_id
			WHERE t.token_hash = p_hash
			  AND t.revoked_at IS NULL
			  AND (t.expires_at IS NULL OR t.expires_at > now());
	END;
	$$;

-- Create an OAT: verify the actor manages the org's tokens, mint a service
-- principal (users row + membership at the token's role), and insert the token.
-- Definer because it inserts a users row (RLS-restricted). Raises with codes the
-- Go layer maps: P0001 forbidden, P0002 not found, P0003 invalid role.
CREATE OR REPLACE FUNCTION flagon.create_oat(
	p_actor text, p_slug text, p_name text, p_role text, p_hash text, p_prefix text
)
	RETURNS uuid
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	DECLARE
		v_org_id uuid;
		v_actor_role text;
		v_principal text;
		v_token_id uuid;
	BEGIN
		SELECT id INTO v_org_id FROM public.orgs WHERE slug = p_slug AND deleted_at IS NULL;
		IF v_org_id IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002'; END IF;

		SELECT role INTO v_actor_role FROM public.memberships
			WHERE org_id = v_org_id AND user_id = p_actor;
		IF v_actor_role IS NULL OR v_actor_role NOT IN ('owner', 'admin') THEN
			RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
		END IF;
		IF p_role NOT IN ('admin', 'member', 'viewer') THEN
			RAISE EXCEPTION 'invalid role' USING ERRCODE = 'P0003';
		END IF;

		v_principal := 'svc_' || replace(gen_random_uuid()::text, '-', '');
		INSERT INTO public.users (id, email, name, is_service)
			VALUES (v_principal, v_principal || '@svc.flagon.local', p_name, true);
		INSERT INTO public.memberships (org_id, user_id, role)
			VALUES (v_org_id, v_principal, p_role);
		INSERT INTO public.access_tokens
			(kind, name, token_hash, token_prefix, principal_user_id, org_id, created_by)
			VALUES ('oat', p_name, p_hash, p_prefix, v_principal, v_org_id, p_actor)
			RETURNING id INTO v_token_id;
		RETURN v_token_id;
	END;
	$$;

-- Delete an OAT: verify the actor manages the org's tokens, then drop the service
-- principal (cascades to its membership + token). Definer for the users delete.
CREATE OR REPLACE FUNCTION flagon.delete_oat(p_actor text, p_token_id uuid)
	RETURNS boolean
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	DECLARE
		v_org_id uuid;
		v_principal text;
	BEGIN
		SELECT org_id, principal_user_id INTO v_org_id, v_principal
			FROM public.access_tokens WHERE id = p_token_id AND kind = 'oat';
		IF v_principal IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE = 'P0002'; END IF;
		IF flagon.org_member_role(v_org_id, p_actor) NOT IN ('owner', 'admin') THEN
			RAISE EXCEPTION 'forbidden' USING ERRCODE = 'P0001';
		END IF;
		DELETE FROM public.users WHERE id = v_principal;  -- cascades membership + token
		RETURN true;
	END;
	$$;
