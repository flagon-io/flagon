-- Org SSO providers, owned by the API.
--
-- Until now an org's OIDC/SAML provider configuration lived only in the app's
-- auth DB, written directly by the app's auth layer. That put a security-critical
-- setting outside the API: no operation, no scope, no agent/MCP tool, and no audit
-- trail. This table makes the API the source of truth and the single writer. The
-- app's auth layer still runs the protocol flow (redirects, assertions, crypto),
-- but its provider table is now a CACHE it rebuilds from this one on every SSO
-- sign-in and callback, so a change made here (from the UI, the API, the agent or
-- MCP) takes effect on the next sign-in, and a deleted provider stops working.
--
-- Secrets (the OIDC client secret, a SAML signing key) live in their own column so
-- no user-facing read ever selects them: owners/admins see a "set" indicator, and
-- only the app-only internal read (flagon.sso_provider_configs) returns them.
--
-- Deletes are soft (deleted_at). A deleted row is a tombstone: it frees the
-- provider id and domain for reuse, and it tells the one-time import path that the
-- provider was removed on purpose, so a stale cache row can never resurrect it.

CREATE TABLE public.sso_providers (
	id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
	provider_id text NOT NULL,
	type        text NOT NULL CHECK (type IN ('oidc', 'saml')),
	domain      text NOT NULL DEFAULT '',
	issuer      text NOT NULL,
	config      jsonb NOT NULL DEFAULT '{}'::jsonb,
	secrets     jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_by  text REFERENCES public.users(id) ON DELETE SET NULL,
	created_at  timestamptz NOT NULL DEFAULT now(),
	updated_at  timestamptz NOT NULL DEFAULT now(),
	deleted_at  timestamptz
);

-- The provider id is part of the sign-in callback URL, which is one namespace for
-- the whole deployment, so live ids are unique across orgs (not just per org).
CREATE UNIQUE INDEX sso_providers_provider_id_live_idx
	ON public.sso_providers (provider_id) WHERE deleted_at IS NULL;
-- An email domain routes "sign in with SSO" to exactly one live provider.
CREATE UNIQUE INDEX sso_providers_domain_live_idx
	ON public.sso_providers (lower(domain)) WHERE deleted_at IS NULL AND domain <> '';
CREATE INDEX sso_providers_org_idx ON public.sso_providers (org_id);
CREATE INDEX sso_providers_provider_id_idx ON public.sso_providers (provider_id);

-- ENABLEd, not FORCEd (like every tenant table, see 0003): the runtime app role is
-- bound by the policy; the table owner is reached only through the definer helpers.
ALTER TABLE public.sso_providers ENABLE ROW LEVEL SECURITY;

-- SSO configuration is a security setting: owners/admins only, for reads as well
-- as writes (members never see it). The Go layer repeats the role check to answer
-- 403 rather than an empty list.
CREATE POLICY sso_providers_admin ON public.sso_providers FOR ALL
	USING (flagon.org_member_role(sso_providers.org_id, flagon.current_user_id()) IN ('owner', 'admin'))
	WITH CHECK (flagon.org_member_role(sso_providers.org_id, flagon.current_user_id()) IN ('owner', 'admin'));

-- The app-only read of full provider configuration, secrets included, for the
-- auth layer's cache. SECURITY DEFINER because it runs with no user bound (the
-- sign-in has not happened yet); it is reachable only from the internal-token API
-- operation. Every non-null filter narrows (AND); with none it returns nothing.
-- Only live providers of live orgs are returned, so deleting either one ends SSO.
-- A domain filter matches the way the auth layer routes an email: the email's
-- domain equals, or is a subdomain of, one of the provider's domains.
CREATE OR REPLACE FUNCTION flagon.sso_provider_configs(p_provider_id text, p_domain text, p_org_id uuid)
	RETURNS TABLE (
		id          uuid,
		org_id      uuid,
		provider_id text,
		type        text,
		domain      text,
		issuer      text,
		config      jsonb,
		secrets     jsonb,
		user_id     text,
		created_at  timestamptz,
		updated_at  timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT s.id, s.org_id, s.provider_id, s.type, s.domain, s.issuer, s.config, s.secrets,
		       -- The auth layer's cache row needs an owning user; fall back to an org
		       -- owner when the creator is gone (or the row was imported).
		       COALESCE(s.created_by, (
		           SELECT m.user_id FROM public.memberships m
		           WHERE m.org_id = s.org_id AND m.role = 'owner'
		           ORDER BY m.created_at LIMIT 1
		       )),
		       s.created_at, s.updated_at
		FROM public.sso_providers s
		JOIN public.orgs o ON o.id = s.org_id AND o.deleted_at IS NULL
		WHERE s.deleted_at IS NULL
		  AND (p_provider_id IS NOT NULL OR p_domain IS NOT NULL OR p_org_id IS NOT NULL)
		  AND (p_provider_id IS NULL OR s.provider_id = p_provider_id)
		  AND (p_org_id IS NULL OR s.org_id = p_org_id)
		  AND (p_domain IS NULL OR EXISTS (
		      SELECT 1 FROM unnest(string_to_array(lower(s.domain), ',')) AS d(part)
		      WHERE btrim(d.part) <> ''
		        AND (lower(p_domain) = btrim(d.part) OR lower(p_domain) LIKE '%.' || btrim(d.part))
		  ))
		ORDER BY s.provider_id
	$$;

-- The one-time adoption path for providers registered before the API owned them
-- (they exist only in the app's auth DB). Idempotent and never destructive:
--   * a provider id the API has NEVER seen (no live row, no tombstone) is inserted
--     into the given live org and 'imported' is returned;
--   * a live row already exists: nothing changes, 'exists';
--   * only a tombstone exists (deleted on purpose): nothing changes, 'deleted',
--     so a stale cache row cannot bring a removed provider back;
--   * the org no longer exists at all: 'no_org'.
-- A soft-deleted org still adopts the provider (its configuration is kept for a
-- restore), but the internal read serves nothing for a deleted org.
-- SECURITY DEFINER because no user is bound; reachable only from the internal-token
-- API operation. The caller audits an 'imported' result in the same transaction.
CREATE OR REPLACE FUNCTION flagon.import_sso_provider(
	p_org_id      uuid,
	p_provider_id text,
	p_type        text,
	p_domain      text,
	p_issuer      text,
	p_config      jsonb,
	p_secrets     jsonb,
	p_created_by  text
)
	RETURNS text
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	BEGIN
		IF EXISTS (SELECT 1 FROM public.sso_providers WHERE provider_id = p_provider_id AND deleted_at IS NULL) THEN
			RETURN 'exists';
		END IF;
		IF EXISTS (SELECT 1 FROM public.sso_providers WHERE provider_id = p_provider_id) THEN
			RETURN 'deleted';
		END IF;
		IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = p_org_id) THEN
			RETURN 'no_org';
		END IF;
		INSERT INTO public.sso_providers (org_id, provider_id, type, domain, issuer, config, secrets, created_by)
		VALUES (
			p_org_id, p_provider_id, p_type, p_domain, p_issuer, p_config, p_secrets,
			(SELECT u.id FROM public.users u WHERE u.id = p_created_by)
		);
		RETURN 'imported';
	END;
	$$;
