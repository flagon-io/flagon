-- Soft delete + restore need to READ the deleted row: the delete's RETURNING
-- reads the row it just stamped, and restore must find the deleted row by slug.
-- The original SELECT policy hid rows with deleted_at set, so both failed with an
-- RLS error. Relax the policy to membership only; live-vs-deleted visibility is
-- enforced at the query layer instead (ListProjects/GetProject filter
-- deleted_at IS NULL), which also keeps the door open for a future trash view.
DROP POLICY projects_member_select ON public.projects;

CREATE POLICY projects_member_select ON public.projects FOR SELECT
	USING (EXISTS (
		SELECT 1 FROM public.memberships m
		WHERE m.org_id = projects.org_id AND m.user_id = flagon.current_user_id()
	));
