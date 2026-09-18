-- Classic-style token scopes. The access_tokens.scopes jsonb column already
-- exists (0009); this teaches the bearer resolver to return it so the API can
-- enforce a per-operation scope allow-list. NULL scopes = full access (the
-- token acts with its principal's full role); a JSON array = restricted to those
-- scopes. Changing the RETURNS shape means we must drop the old signature first.
DROP FUNCTION IF EXISTS flagon.resolve_access_token(text);
CREATE OR REPLACE FUNCTION flagon.resolve_access_token(p_hash text)
	RETURNS TABLE (principal_user_id text, email text, kind text, org_id uuid, scopes jsonb)
	LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
	AS $$
	BEGIN
		UPDATE public.access_tokens t SET last_used_at = now()
		WHERE t.token_hash = p_hash
		  AND t.revoked_at IS NULL
		  AND (t.expires_at IS NULL OR t.expires_at > now());
		RETURN QUERY
			SELECT t.principal_user_id, u.email, t.kind, t.org_id, t.scopes
			FROM public.access_tokens t
			JOIN public.users u ON u.id = t.principal_user_id
			WHERE t.token_hash = p_hash
			  AND t.revoked_at IS NULL
			  AND (t.expires_at IS NULL OR t.expires_at > now());
	END;
	$$;
