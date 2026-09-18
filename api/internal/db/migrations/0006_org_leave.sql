-- A member can only see their OWN membership row (memberships_self RLS), so they
-- can't count an org's owners to know whether they're the last one. This
-- SECURITY DEFINER helper returns just that count (no membership data), letting
-- LeaveOrg block the sole owner from leaving without weakening RLS.
CREATE OR REPLACE FUNCTION flagon.org_owner_count(p_org_id uuid)
	RETURNS integer
	LANGUAGE sql
	SECURITY DEFINER
	STABLE
	SET search_path = public
	AS $$
		SELECT count(*)::int FROM public.memberships
		WHERE org_id = p_org_id AND role = 'owner'
	$$;

COMMENT ON FUNCTION flagon.org_owner_count(uuid) IS
	'Owner count for an org, past memberships RLS. Guards the last owner from leaving.';
