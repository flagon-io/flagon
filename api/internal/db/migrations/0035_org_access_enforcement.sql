-- API-side enforcement of the org security policy (2FA + SSO requirements).
--
-- Until now the org's enforce_two_factor / require_sso flags were stored here but
-- only the app's page gate read them, so a personal access token, the MCP server
-- or any direct API call skipped the policy entirely. The API now enforces it on
-- every org-scoped operation, which needs two facts about each user that live in
-- the app's auth layer. The app mirrors both here (the same way it mirrors the
-- public profile):
--
--   * users.two_factor_enabled - whether the account has 2FA turned on.
--   * user_sso_identities      - which SSO providers the user has ever signed in
--     through (a linked SSO identity). A personal access token is accepted in a
--     require-SSO org only when its owner has signed in through one of that
--     org's live providers at least once.
--
-- How the CURRENT session authenticated is not stored here: the app asserts it
-- per request across the internal-token boundary.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.user_sso_identities (
	user_id       text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	provider_id   text NOT NULL,
	first_seen_at timestamptz NOT NULL DEFAULT now(),
	last_seen_at  timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, provider_id)
);
CREATE INDEX user_sso_identities_provider_idx ON public.user_sso_identities (provider_id);

-- ENABLEd, not FORCEd (like every tenant table): the runtime app role is bound by
-- the policy. A user only ever reads or writes their own identities.
ALTER TABLE public.user_sso_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_sso_identities_self ON public.user_sso_identities FOR ALL
	USING (user_id = flagon.current_user_id())
	WITH CHECK (user_id = flagon.current_user_id());

-- The policy decision needs the org's live SSO provider ids, which members can't
-- read (sso_providers is owners/admins only). This SECURITY DEFINER window returns
-- exactly what the access check needs and nothing else: one row when the caller
-- (bound to the transaction, see 0030) is a member of the live org named by slug
-- or id, none otherwise. No secrets or provider configuration leave it.
CREATE OR REPLACE FUNCTION flagon.org_access_state(p_user_id text, p_slug text, p_org_id uuid)
	RETURNS TABLE (
		org_id             uuid,
		role               text,
		enforce_two_factor boolean,
		require_sso        boolean,
		user_two_factor    boolean,
		is_service         boolean,
		provider_ids       text[],
		linked_sso         boolean
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT o.id, m.role, o.enforce_two_factor, o.require_sso,
		       COALESCE(u.two_factor_enabled, false),
		       COALESCE(u.is_service, false),
		       COALESCE((SELECT array_agg(s.provider_id ORDER BY s.provider_id)
		                 FROM public.sso_providers s
		                 WHERE s.org_id = o.id AND s.deleted_at IS NULL), '{}'::text[]),
		       EXISTS (SELECT 1
		               FROM public.user_sso_identities i
		               JOIN public.sso_providers s
		                 ON s.provider_id = i.provider_id AND s.org_id = o.id AND s.deleted_at IS NULL
		               WHERE i.user_id = p_user_id)
		FROM public.orgs o
		JOIN public.memberships m ON m.org_id = o.id AND m.user_id = p_user_id
		LEFT JOIN public.users u ON u.id = p_user_id
		WHERE o.deleted_at IS NULL
		  AND p_user_id = flagon.current_user_id()
		  AND ((p_slug IS NOT NULL AND o.slug = p_slug) OR (p_org_id IS NOT NULL AND o.id = p_org_id))
	$$;
