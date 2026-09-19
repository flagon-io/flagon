-- Org SSO: the "require SSO" policy and the provisioning path for SSO logins.
-- The SSO mechanism (OIDC/SAML) lives in the app's auth layer (BetterAuth's SSO
-- plugin, which owns the provider registry in the auth DB). Here we store the
-- org-level requirement and provide the trusted path to add an SSO'd user as a
-- member.

-- require_sso: members must sign in through the org's configured SSO provider.
-- Stored here, enforced at the app gate (which knows the session's auth method).
-- Default off, beside enforce_two_factor (0022).
ALTER TABLE public.orgs
	ADD COLUMN require_sso boolean NOT NULL DEFAULT false;

-- provision_sso_member idempotently adds a user - already authenticated through the
-- org's own SSO IdP, verified by the app's auth layer before this is called across
-- the internal-token boundary - as a member of that org. SECURITY DEFINER so it can
-- write a membership the user could not add themselves; it only ever touches a LIVE
-- org and never downgrades an existing membership. Returns true when it created a
-- new membership, so the caller can audit the join.
CREATE OR REPLACE FUNCTION flagon.provision_sso_member(p_org_id uuid, p_user_id text, p_role text)
	RETURNS boolean
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	DECLARE n int;
	BEGIN
		IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = p_org_id AND deleted_at IS NULL) THEN
			RETURN false;
		END IF;
		INSERT INTO public.memberships (org_id, user_id, role)
		VALUES (p_org_id, p_user_id, p_role)
		ON CONFLICT (org_id, user_id) DO NOTHING;
		GET DIAGNOSTICS n = ROW_COUNT;
		RETURN n > 0;
	END;
	$$;
