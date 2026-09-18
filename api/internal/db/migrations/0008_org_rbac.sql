-- Org RBAC baseline: three roles (owner > admin > member) and the member
-- management surface. Enforcement stays layered: RLS gates who can touch an
-- org's memberships at all; the Go layer applies the business rules (role
-- hierarchy, last-owner protection). Cross-RLS reads (co-members' user details,
-- looking a user up by login) go through SECURITY DEFINER helpers, the same safe
-- pattern used elsewhere - each returns only what the caller is entitled to.

ALTER TABLE public.memberships
	ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'admin', 'member'));

-- A user's role in an org (NULL if not a member). Definer so it can back both
-- RLS policies and Go role checks without RLS recursion.
CREATE OR REPLACE FUNCTION flagon.org_member_role(p_org_id uuid, p_user_id text)
	RETURNS text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT role FROM public.memberships WHERE org_id = p_org_id AND user_id = p_user_id
	$$;

-- Resolve a user id from an email or username (case-insensitive). Definer so an
-- admin can look up a user to add without seeing the users table directly.
CREATE OR REPLACE FUNCTION flagon.find_user_by_login(p_login text)
	RETURNS text
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT id FROM public.users
		WHERE lower(email) = lower(p_login) OR lower(username) = lower(p_login)
		LIMIT 1
	$$;

-- The member list with user details, but only when the caller (p_actor) is a
-- member of the org. Definer, so members can see co-members' names/emails past
-- the users_self RLS, while non-members get nothing.
CREATE OR REPLACE FUNCTION flagon.org_members(p_actor text, p_slug text)
	RETURNS TABLE (
		user_id    text,
		name       text,
		email      text,
		username   text,
		avatar_url text,
		role       text,
		joined_at  timestamptz
	)
	LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
	AS $$
		SELECT u.id, u.name, u.email, u.username, u.avatar_url, m.role, m.created_at
		FROM public.orgs o
		JOIN public.memberships m ON m.org_id = o.id
		JOIN public.users u ON u.id = m.user_id
		WHERE o.slug = p_slug AND o.deleted_at IS NULL
		  AND EXISTS (
			SELECT 1 FROM public.memberships am WHERE am.org_id = o.id AND am.user_id = p_actor
		  )
		ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC, lower(u.email)
	$$;

-- Owners and admins may create/modify/delete memberships in their org. The Go
-- layer still enforces the hierarchy (admins can't touch owners, only owners
-- grant owner) and last-owner protection on top of this. The existing
-- memberships_self policy still covers self-service (leaving).
CREATE POLICY memberships_org_manage ON public.memberships FOR ALL
	USING (flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'))
	WITH CHECK (flagon.org_member_role(org_id, flagon.current_user_id()) IN ('owner', 'admin'));
