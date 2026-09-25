package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// TestOrgSoftDeleteHidesEverythingAndRestoreBringsItBack drives org soft delete
// end to end against real Postgres + RLS (migration 0031): a deleted org's
// projects, members and tokens vanish for everyone, its slug is freed, deleted
// orgs don't count toward the plan limit (but restore re-checks it), a taken slug
// forces a rename on restore, and restore brings everything back. Skips unless
// FLAGON_TEST_DATABASE_URL is set.
func TestOrgSoftDeleteHidesEverythingAndRestoreBringsItBack(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	owner, member, other := "user-od-owner-"+u, "user-od-member-"+u, "user-od-other-"+u
	memberEmail := "od-member-" + u + "@example.com"
	slug := "od-co-" + u

	org, err := d.CreateOrg(ctx, owner, "od-owner-"+u+"@example.com", "Deleted Co", slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	if _, _, err := d.Me(ctx, member, memberEmail); err != nil {
		t.Fatalf("member Me: %v", err)
	}
	if _, _, err := d.AddMember(ctx, owner, slug, memberEmail, RoleMember); err != nil {
		t.Fatalf("AddMember: %v", err)
	}
	if _, err := d.CreateProject(ctx, owner, slug, ProjectInput{Name: "Web", Slug: "web"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	oat, _, err := d.CreateOAT(ctx, owner, slug, "ci", RoleMember, nil, nil)
	if err != nil {
		t.Fatalf("CreateOAT: %v", err)
	}
	if _, err := d.ResolveToken(ctx, oat); err != nil {
		t.Fatalf("ResolveToken before delete: %v", err)
	}
	membersBefore, _, err := d.ListMembers(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListMembers before delete: %v", err)
	}

	// Only an owner may delete.
	if _, _, err := d.DeleteOrg(ctx, member, slug); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member DeleteOrg err = %v, want ErrForbidden", err)
	}

	deleted, recipients, err := d.DeleteOrg(ctx, owner, slug)
	if err != nil {
		t.Fatalf("owner DeleteOrg: %v", err)
	}
	if deleted.DeletedAt == nil {
		t.Error("deleted org has no deleted_at")
	}
	if !containsID(recipients, owner) || !containsID(recipients, member) || len(recipients) != 2 {
		t.Errorf("notify recipients = %v, want exactly the owner and the member (no service principal)", recipients)
	}

	// Gone for everyone: org lists, org-scoped reads, and raw RLS-visible rows.
	for _, who := range []string{owner, member} {
		orgs, err := d.ListOrgs(ctx, who)
		if err != nil {
			t.Fatalf("ListOrgs(%s): %v", who, err)
		}
		if containsOrg(orgs, org.ID) {
			t.Errorf("%s still lists the deleted org", who)
		}
		if _, err := d.GetProject(ctx, who, slug, "web"); !errors.Is(err, ErrNotMember) {
			t.Errorf("%s GetProject err = %v, want ErrNotMember", who, err)
		}
		if _, _, err := d.ListProjects(ctx, who, slug, paginate.Query{}); !errors.Is(err, ErrNotMember) {
			t.Errorf("%s ListProjects err = %v, want ErrNotMember", who, err)
		}
		if _, _, err := d.ListMembers(ctx, who, slug, paginate.Query{}); err == nil {
			// The definer window returns no rows for a deleted org.
			members, _, _ := d.ListMembers(ctx, who, slug, paginate.Query{})
			if len(members) != 0 {
				t.Errorf("%s ListMembers returned %d rows for a deleted org", who, len(members))
			}
		}
		if ok, _ := d.IsOrgMember(ctx, who, org.ID); ok {
			t.Errorf("%s IsOrgMember = true for a deleted org", who)
		}
		projects, memberships := rlsVisible(t, ctx, d, who, org.ID)
		if projects != 0 || memberships != 0 {
			t.Errorf("%s sees %d projects and %d memberships of a deleted org via RLS, want 0/0", who, projects, memberships)
		}
	}
	if _, err := d.ResolveToken(ctx, oat); !errors.Is(err, ErrInvalidToken) {
		t.Errorf("ResolveToken after delete err = %v, want ErrInvalidToken", err)
	}

	// The archive: the owner sees it, a plain member does not.
	archive, err := d.ListDeletedOrgs(ctx, owner)
	if err != nil {
		t.Fatalf("ListDeletedOrgs: %v", err)
	}
	if !containsDeleted(archive, org.ID) {
		t.Error("owner's deleted archive is missing the org")
	}
	if memberArchive, _ := d.ListDeletedOrgs(ctx, member); containsDeleted(memberArchive, org.ID) {
		t.Error("a non-owner member sees the org in their deleted archive")
	}
	if _, err := d.RestoreOrg(ctx, member, org.ID, ""); !errors.Is(err, ErrForbidden) {
		t.Errorf("member RestoreOrg err = %v, want ErrForbidden", err)
	}

	// The slug is free: someone else takes it.
	if _, err := d.CreateOrg(ctx, other, "od-other-"+u+"@example.com", "Squatter", slug); err != nil {
		t.Fatalf("CreateOrg reusing a deleted org's slug: %v", err)
	}

	// Deleted orgs don't count toward the plan limit: the owner can create one.
	second, err := d.CreateOrg(ctx, owner, "od-owner-"+u+"@example.com", "Second", "od-second-"+u)
	if err != nil {
		t.Fatalf("CreateOrg while owning only a deleted org: %v", err)
	}
	// ...but restoring re-checks it.
	if _, err := d.RestoreOrg(ctx, owner, org.ID, "od-back-"+u); !errors.Is(err, ErrOrgLimitReached) {
		t.Fatalf("RestoreOrg over the plan limit err = %v, want ErrOrgLimitReached", err)
	}
	if _, _, err := d.DeleteOrg(ctx, owner, second.Slug); err != nil {
		t.Fatalf("DeleteOrg second: %v", err)
	}

	// Old slug is taken: restoring under it conflicts; a new slug works.
	if _, err := d.RestoreOrg(ctx, owner, org.ID, ""); !errors.Is(err, ErrOrgSlugTaken) {
		t.Fatalf("RestoreOrg onto a taken slug err = %v, want ErrOrgSlugTaken", err)
	}
	newSlug := "od-back-" + u
	restored, err := d.RestoreOrg(ctx, owner, org.ID, newSlug)
	if err != nil {
		t.Fatalf("RestoreOrg with a new slug: %v", err)
	}
	if restored.Slug != newSlug || restored.ID != org.ID {
		t.Errorf("restored = %s/%s, want %s/%s", restored.ID, restored.Slug, org.ID, newSlug)
	}
	if archive, _ := d.ListDeletedOrgs(ctx, owner); containsDeleted(archive, org.ID) {
		t.Error("a restored org is still in the deleted archive")
	}

	// Everything is back, under the new slug.
	if _, err := d.GetProject(ctx, member, newSlug, "web"); err != nil {
		t.Errorf("member GetProject after restore: %v", err)
	}
	members, _, err := d.ListMembers(ctx, owner, newSlug, paginate.Query{})
	if err != nil || len(members) != len(membersBefore) {
		t.Errorf("ListMembers after restore = %d rows, err %v; want %d", len(members), err, len(membersBefore))
	}
	if _, err := d.ResolveToken(ctx, oat); err != nil {
		t.Errorf("ResolveToken after restore: %v", err)
	}
	if projects, memberships := rlsVisible(t, ctx, d, member, org.ID); projects != 1 || memberships != 1 {
		t.Errorf("member sees %d projects / %d memberships after restore, want 1/1", projects, memberships)
	}

	// Both halves are audited.
	events, err := d.ListAuditLog(ctx, owner, newSlug, 50)
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	var sawDelete, sawRestore bool
	for _, e := range events {
		sawDelete = sawDelete || e.Action == string(audit.ActionOrgDeleted)
		sawRestore = sawRestore || e.Action == string(audit.ActionOrgRestored)
	}
	if !sawDelete || !sawRestore {
		t.Errorf("audit log delete=%v restore=%v, want both", sawDelete, sawRestore)
	}
}

// rlsVisible counts the org's projects and memberships as the runtime role sees
// them with userID bound, bypassing every Go-level filter.
func rlsVisible(t *testing.T, ctx context.Context, d *DB, userID, orgID string) (projects, memberships int) {
	t.Helper()
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM public.projects WHERE org_id = $1`, orgID).Scan(&projects); err != nil {
			return err
		}
		return tx.QueryRow(ctx, `SELECT count(*) FROM public.memberships WHERE org_id = $1 AND user_id = $2`, orgID, userID).Scan(&memberships)
	})
	if err != nil {
		t.Fatalf("rlsVisible: %v", err)
	}
	return projects, memberships
}

func containsID(ids []string, id string) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func containsDeleted(orgs []DeletedOrg, id string) bool {
	for _, o := range orgs {
		if o.ID == id {
			return true
		}
	}
	return false
}
