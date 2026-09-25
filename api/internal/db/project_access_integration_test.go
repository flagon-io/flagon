package db

import (
	"context"
	"errors"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/paginate"
)

// projectAccessFixture is an org with an owner, an org admin, two plain members
// (member: never in a team; teamMember: in the team), a non-member outsider and a
// team, used by the project-access tests.
type projectAccessFixture struct {
	d                       *DB
	slug, orgID, team       string
	owner, admin            string
	member, memberEmail     string
	teamMember, teamMEmail  string
	outsider, outsiderEmail string
}

func newProjectAccessFixture(t *testing.T, ctx context.Context) projectAccessFixture {
	t.Helper()
	cfg := integrationConfig(t)
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	t.Cleanup(d.Close)

	u := unique(t)
	f := projectAccessFixture{
		d:             d,
		slug:          "pa-co-" + u,
		team:          "pa-team",
		owner:         "pa-owner-" + u,
		admin:         "pa-admin-" + u,
		member:        "pa-member-" + u,
		memberEmail:   "pa-member-" + u + "@example.com",
		teamMember:    "pa-tm-" + u,
		teamMEmail:    "pa-tm-" + u + "@example.com",
		outsider:      "pa-outsider-" + u,
		outsiderEmail: "pa-outsider-" + u + "@example.com",
	}
	adminEmail := "pa-admin-" + u + "@example.com"
	for id, email := range map[string]string{
		f.admin: adminEmail, f.member: f.memberEmail, f.teamMember: f.teamMEmail, f.outsider: f.outsiderEmail,
	} {
		if _, _, err := d.Me(ctx, id, email); err != nil {
			t.Fatalf("Me %s: %v", id, err)
		}
	}
	org, err := d.CreateOrg(ctx, f.owner, "pa-owner-"+u+"@example.com", "PA Co", f.slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	f.orgID = org.ID
	for login, role := range map[string]string{adminEmail: RoleAdmin, f.memberEmail: RoleMember, f.teamMEmail: RoleMember} {
		if _, _, err := d.AddMember(ctx, f.owner, f.slug, login, role); err != nil {
			t.Fatalf("AddMember %s: %v", login, err)
		}
	}
	if _, err := d.CreateTeam(ctx, f.owner, f.slug, TeamInput{Name: "PA Team", Slug: f.team}); err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}
	if _, err := d.AddTeamMember(ctx, f.owner, f.slug, f.team, f.teamMEmail, "member"); err != nil {
		t.Fatalf("AddTeamMember: %v", err)
	}
	return f
}

func (f projectAccessFixture) setBase(t *testing.T, ctx context.Context, base string) {
	t.Helper()
	if err := f.d.SetOrgSecurity(ctx, f.owner, f.slug, OrgSecurity{BasePermission: base}); err != nil {
		t.Fatalf("SetOrgSecurity base=%s: %v", base, err)
	}
}

func strPtr(s string) *string { return &s }

// TestProjectAccessEnforcement drives the real store: the base permission and the
// per-project grants decide who can see and edit a project, and a project the
// caller cannot view is "not found", never "forbidden". Skips unless
// FLAGON_TEST_DATABASE_URL is set.
func TestProjectAccessEnforcement(t *testing.T) {
	ctx := context.Background()
	f := newProjectAccessFixture(t, ctx)
	d := f.d

	if _, err := d.CreateProject(ctx, f.owner, f.slug, ProjectInput{Name: "App", Slug: "app"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}

	visible := func(actor string) int {
		t.Helper()
		ps, _, err := d.ListProjects(ctx, actor, f.slug, paginate.Query{})
		if err != nil {
			t.Fatalf("ListProjects as %s: %v", actor, err)
		}
		return len(ps)
	}
	edit := func(actor string, in ProjectUpdate) error {
		_, err := d.UpdateProject(ctx, actor, f.slug, "app", in)
		return err
	}

	// base none, no grant: invisible everywhere, and every read/edit is not found.
	f.setBase(t, ctx, BasePermissionNone)
	if n := visible(f.member); n != 0 {
		t.Fatalf("base none: member lists %d projects, want 0", n)
	}
	if _, err := d.GetProject(ctx, f.member, f.slug, "app"); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: GetProject err = %v, want ErrProjectNotFound", err)
	}
	if err := edit(f.member, ProjectUpdate{Description: strPtr("x")}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: UpdateProject err = %v, want ErrProjectNotFound", err)
	}
	if _, _, err := d.ListProjectMembers(ctx, f.member, f.slug, "app", paginate.Query{}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: ListProjectMembers err = %v, want ErrProjectNotFound", err)
	}
	if _, _, err := d.ListProjectTeams(ctx, f.member, f.slug, "app", paginate.Query{}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: ListProjectTeams err = %v, want ErrProjectNotFound", err)
	}
	if _, _, err := d.ListProjectOwners(ctx, f.member, f.slug, "app", paginate.Query{}); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: ListProjectOwners err = %v, want ErrProjectNotFound", err)
	}
	if _, err := d.AddProjectMember(ctx, f.member, f.slug, "app", f.teamMEmail, ProjectRoleRead); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: AddProjectMember err = %v, want ErrProjectNotFound", err)
	}
	if _, err := d.SetProjectDeleted(ctx, f.member, f.slug, "app", true); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("base none: delete err = %v, want ErrProjectNotFound", err)
	}

	// Org owners/admins see and edit everything regardless of the base.
	for _, actor := range []string{f.owner, f.admin} {
		if n := visible(actor); n != 1 {
			t.Fatalf("org %s lists %d projects, want 1", actor, n)
		}
		p, err := d.GetProject(ctx, actor, f.slug, "app")
		if err != nil {
			t.Fatalf("org %s GetProject: %v", actor, err)
		}
		if p.Viewer == nil || !p.Viewer.Owner || p.Viewer.Role != ProjectRoleAdmin || len(p.Viewer.Permissions) != 5 {
			t.Fatalf("org %s viewer = %+v, want admin owner with all permissions", actor, p.Viewer)
		}
		if err := edit(actor, ProjectUpdate{Description: strPtr("by " + actor)}); err != nil {
			t.Fatalf("org %s UpdateProject: %v", actor, err)
		}
	}

	// base read: visible but read-only (403 on edit).
	f.setBase(t, ctx, ProjectRoleRead)
	if n := visible(f.member); n != 1 {
		t.Fatalf("base read: member lists %d projects, want 1", n)
	}
	p, err := d.GetProject(ctx, f.member, f.slug, "app")
	if err != nil {
		t.Fatalf("base read: GetProject: %v", err)
	}
	if p.Viewer == nil || p.Viewer.Role != ProjectRoleRead || p.Viewer.Owner ||
		len(p.Viewer.Permissions) != 1 || p.Viewer.Permissions[0] != string(ProjCapView) {
		t.Fatalf("base read: viewer = %+v, want read with only project:view", p.Viewer)
	}
	if err := edit(f.member, ProjectUpdate{Description: strPtr("x")}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("base read: UpdateProject err = %v, want ErrForbidden", err)
	}
	if _, _, err := d.ListProjectMembers(ctx, f.member, f.slug, "app", paginate.Query{}); err != nil {
		t.Fatalf("base read: ListProjectMembers: %v", err)
	}
	if _, err := d.AddProjectMember(ctx, f.member, f.slug, "app", f.teamMEmail, ProjectRoleRead); !errors.Is(err, ErrForbidden) {
		t.Fatalf("base read: AddProjectMember err = %v, want ErrForbidden", err)
	}

	// base none + a direct write grant: visible and editable, but a slug rename
	// needs maintain.
	f.setBase(t, ctx, BasePermissionNone)
	if _, err := d.AddProjectMember(ctx, f.owner, f.slug, "app", f.memberEmail, ProjectRoleWrite); err != nil {
		t.Fatalf("AddProjectMember write: %v", err)
	}
	if n := visible(f.member); n != 1 {
		t.Fatalf("write grant: member lists %d projects, want 1", n)
	}
	if err := edit(f.member, ProjectUpdate{Description: strPtr("by the member")}); err != nil {
		t.Fatalf("write grant: UpdateProject: %v", err)
	}
	if err := edit(f.member, ProjectUpdate{Slug: strPtr("renamed")}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("write grant: rename err = %v, want ErrForbidden (needs maintain)", err)
	}
	if err := edit(f.member, ProjectUpdate{Slug: strPtr("app"), Name: strPtr("App")}); err != nil {
		t.Fatalf("write grant: same-slug edit: %v", err)
	}
	if err := d.SetProjectMemberRole(ctx, f.owner, f.slug, "app", f.member, ProjectRoleMaintain); err != nil {
		t.Fatalf("SetProjectMemberRole maintain: %v", err)
	}
	if _, err := d.UpdateProject(ctx, f.member, f.slug, "app", ProjectUpdate{Slug: strPtr("renamed")}); err != nil {
		t.Fatalf("maintain grant: rename: %v", err)
	}
	if _, err := d.UpdateProject(ctx, f.member, f.slug, "renamed", ProjectUpdate{Slug: strPtr("app")}); err != nil {
		t.Fatalf("maintain grant: rename back: %v", err)
	}
	// Maintain still cannot delete (owner tier): visible, so 403 not 404.
	if _, err := d.SetProjectDeleted(ctx, f.member, f.slug, "app", true); !errors.Is(err, ErrForbidden) {
		t.Fatalf("maintain grant: delete err = %v, want ErrForbidden", err)
	}

	// A team grant works the same way for the team's members.
	if _, err := d.GetProject(ctx, f.teamMember, f.slug, "app"); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("no team grant: GetProject err = %v, want ErrProjectNotFound", err)
	}
	if err := d.AddProjectTeam(ctx, f.owner, f.slug, "app", f.team, ProjectRoleWrite); err != nil {
		t.Fatalf("AddProjectTeam write: %v", err)
	}
	if n := visible(f.teamMember); n != 1 {
		t.Fatalf("team grant: team member lists %d projects, want 1", n)
	}
	if err := edit(f.teamMember, ProjectUpdate{Description: strPtr("by the team")}); err != nil {
		t.Fatalf("team grant: UpdateProject: %v", err)
	}

	// The team's Projects tab only lists the projects the CALLER can view.
	plain := "pa-plain-" + unique(t)
	if _, _, err := d.Me(ctx, plain, plain+"@example.com"); err != nil {
		t.Fatalf("Me plain: %v", err)
	}
	if _, _, err := d.AddMember(ctx, f.owner, f.slug, plain+"@example.com", RoleMember); err != nil {
		t.Fatalf("AddMember plain: %v", err)
	}
	if tps, _, err := d.ListTeamProjects(ctx, plain, f.slug, f.team, paginate.Query{}); err != nil || len(tps) != 0 {
		t.Fatalf("ListTeamProjects for a member without access = %d rows (err %v), want 0", len(tps), err)
	}
	if tps, _, err := d.ListTeamProjects(ctx, f.teamMember, f.slug, f.team, paginate.Query{}); err != nil || len(tps) != 1 {
		t.Fatalf("ListTeamProjects for a team member = %d rows (err %v), want 1", len(tps), err)
	}

	// A non-member sees nothing at all.
	if _, err := d.GetProject(ctx, f.outsider, f.slug, "app"); !errors.Is(err, ErrNotMember) {
		t.Fatalf("outsider GetProject err = %v, want ErrNotMember", err)
	}

	// A plain member creating a project under base none becomes its admin (the
	// creator grant), and it stays invisible to other plain members.
	created, err := d.CreateProject(ctx, f.teamMember, f.slug, ProjectInput{Name: "Mine", Slug: "mine"})
	if err != nil {
		t.Fatalf("member CreateProject under base none: %v", err)
	}
	if created.Slug != "mine" {
		t.Fatalf("created slug = %q, want mine", created.Slug)
	}
	mine, err := d.GetProject(ctx, f.teamMember, f.slug, "mine")
	if err != nil {
		t.Fatalf("creator GetProject: %v", err)
	}
	if mine.Viewer == nil || mine.Viewer.Role != ProjectRoleAdmin || mine.Viewer.Owner {
		t.Fatalf("creator viewer = %+v, want admin (not owner)", mine.Viewer)
	}
	if _, err := d.GetProject(ctx, f.member, f.slug, "mine"); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("other member GetProject(mine) err = %v, want ErrProjectNotFound", err)
	}
	// The creator grant is not callable for someone else's project.
	err = d.inUserTx(ctx, f.member, func(ctx context.Context, tx pgx.Tx) error {
		var granted bool
		if err := tx.QueryRow(ctx, `SELECT flagon.grant_project_creator($1)`, created.ID).Scan(&granted); err != nil {
			return err
		}
		if granted {
			return errors.New("grant_project_creator granted a non-creator")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// TestProjectAccessSQLMatchesGo proves the SQL rule (flagon.project_effective_role
// / flagon.project_permits, which back RLS and the list filter) and the Go rule
// (resolveProjectAuthority, which gates the store) agree - and that both agree
// with the pure-Go oracle (EffectiveProjectRole + team grant + ownership) - across
// org roles (owner/admin/member/non-member), every base permission, direct
// grants, team grants and ownership. It also checks that RLS row visibility equals
// the Go view capability. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestProjectAccessSQLMatchesGo(t *testing.T) {
	ctx := context.Background()
	f := newProjectAccessFixture(t, ctx)
	d := f.d

	// The grants name the team member (who is in the team, so both kinds apply).
	// One project per combination of direct grant x team grant x ownership.
	type combo struct {
		id, slug, userGrant, teamGrant string
		owner                          bool
	}
	orNone := func(s string) string {
		if s == "" {
			return "none"
		}
		return s
	}
	var combos []combo
	for _, ug := range []string{"", ProjectRoleRead, ProjectRoleWrite, ProjectRoleAdmin} {
		for _, tg := range []string{"", ProjectRoleRead, ProjectRoleMaintain} {
			for _, own := range []bool{false, true} {
				c := combo{slug: fmt.Sprintf("p-%s-%s-%t", orNone(ug), orNone(tg), own), userGrant: ug, teamGrant: tg, owner: own}
				p, err := d.CreateProject(ctx, f.owner, f.slug, ProjectInput{Name: c.slug, Slug: c.slug})
				if err != nil {
					t.Fatalf("CreateProject %s: %v", c.slug, err)
				}
				c.id = p.ID
				if ug != "" {
					if _, err := d.AddProjectMember(ctx, f.owner, f.slug, c.slug, f.teamMEmail, ug); err != nil {
						t.Fatalf("AddProjectMember %s: %v", c.slug, err)
					}
				}
				if tg != "" {
					if err := d.AddProjectTeam(ctx, f.owner, f.slug, c.slug, f.team, tg); err != nil {
						t.Fatalf("AddProjectTeam %s: %v", c.slug, err)
					}
				}
				if own {
					if _, err := d.AddProjectOwner(ctx, f.owner, f.slug, c.slug, OwnerTypeUser, f.teamMEmail); err != nil {
						t.Fatalf("AddProjectOwner %s: %v", c.slug, err)
					}
				}
				combos = append(combos, c)
			}
		}
	}

	principals := []struct {
		id, orgRole string
		granted     bool // whether the combos' grants name this principal
	}{
		{f.owner, RoleOwner, false},
		{f.admin, RoleAdmin, false},
		{f.teamMember, RoleMember, true},
		{f.member, RoleMember, false}, // plain member, no grants: the base alone
		{f.outsider, "", false},       // not a member of the org
	}
	caps := []struct {
		cap ProjectCapability
		min string
	}{
		{ProjCapView, ProjectRoleRead},
		{ProjCapWrite, ProjectRoleWrite},
		{ProjCapManage, ProjectRoleMaintain},
		{ProjCapAdmin, ProjectRoleAdmin},
	}

	checked := 0
	for _, base := range []string{BasePermissionNone, ProjectRoleRead, ProjectRoleTriage, ProjectRoleWrite, ProjectRoleMaintain, ProjectRoleAdmin} {
		f.setBase(t, ctx, base)
		for _, pr := range principals {
			for _, c := range combos {
				// The oracle: the documented rule, from the pure-Go helpers.
				var want projectAuthority
				switch pr.orgRole {
				case RoleOwner, RoleAdmin:
					want = projectAuthority{Role: ProjectRoleAdmin, Owner: true}
				case "":
					want = projectAuthority{}
				default:
					ug, tg := "", ""
					if pr.granted {
						ug, tg = c.userGrant, c.teamGrant
					}
					want = projectAuthority{
						Role:  maxProjectRole(EffectiveProjectRole(pr.orgRole, base, ug), tg),
						Owner: pr.granted && c.owner,
					}
				}
				name := fmt.Sprintf("base=%s actor=%s project=%s", base, orNone(pr.orgRole), c.slug)

				err := d.inUserTx(ctx, pr.id, func(ctx context.Context, tx pgx.Tx) error {
					got, err := resolveProjectAuthority(ctx, tx, f.orgID, c.id, pr.id)
					if err != nil {
						return err
					}
					if got != want {
						t.Errorf("%s: Go authority = %+v, want %+v", name, got, want)
					}
					var sqlRole string
					var sqlOwner bool
					var visible int
					if err := tx.QueryRow(ctx,
						`SELECT COALESCE(flagon.project_effective_role($1, $2, $3), ''),
						        COALESCE(flagon.org_member_role($1, $3) IN ('owner', 'admin'), false)
						          OR (flagon.org_member_role($1, $3) IS NOT NULL AND flagon.user_owns_project($2, $3)),
						        (SELECT count(*)::int FROM public.projects WHERE id = $2)`,
						f.orgID, c.id, pr.id).Scan(&sqlRole, &sqlOwner, &visible); err != nil {
						return err
					}
					if sqlRole != want.Role || sqlOwner != want.Owner {
						t.Errorf("%s: SQL role/owner = %q/%t, want %q/%t", name, sqlRole, sqlOwner, want.Role, want.Owner)
					}
					if (visible == 1) != want.can(ProjCapView) {
						t.Errorf("%s: RLS visible = %d, want view=%t", name, visible, want.can(ProjCapView))
					}
					for _, cp := range caps {
						var permits bool
						if err := tx.QueryRow(ctx, `SELECT flagon.project_permits($1, $2, $3, $4)`,
							f.orgID, c.id, pr.id, cp.min).Scan(&permits); err != nil {
							return err
						}
						if permits != want.can(cp.cap) || got.can(cp.cap) != want.can(cp.cap) {
							t.Errorf("%s: %s SQL=%t Go=%t want=%t", name, cp.cap, permits, got.can(cp.cap), want.can(cp.cap))
						}
					}
					return nil
				})
				if err != nil {
					t.Fatalf("%s: %v", name, err)
				}
				checked++
			}
		}
	}
	if want := 6 * 5 * len(combos); checked != want {
		t.Fatalf("checked %d cases, want %d", checked, want)
	}
}
