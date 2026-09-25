package server

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// testOrgID is the one org the fake store's caller belongs to.
const testOrgID = "11111111-1111-1111-1111-111111111111"

// fakeStore is an in-memory IdentityStore for handler, permission, MCP, and AI
// tests. Tokens resolve to a principal holding `scopes` (nil = full access), or
// fail with resolveErr. Every domain method returns benign values keyed on its
// inputs, or `err` when set, so a test can drive the error-mapping path through
// the real handlers. Notifications are recorded so tests can assert that a
// front door emitted them.
type fakeStore struct {
	scopes     []string
	resolveErr error
	err        error
	// kind is the resolved token's kind ("" = "pat").
	kind string
	// access is what OrgAccessState reports (zero = not a member, so the org
	// security policy never gets in the way unless a test sets it).
	access db.OrgAccess
	// role is the caller's org role GetOrg reports ("" = "owner").
	role string

	mu    *sync.Mutex
	notes *[]string
}

func newFakeStore(scopes []string) fakeStore {
	return fakeStore{scopes: scopes, mu: &sync.Mutex{}, notes: &[]string{}}
}

// notifications returns the notification types emitted so far.
func (f fakeStore) notifications() []string {
	if f.mu == nil {
		return nil
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]string(nil), *f.notes...)
}

func (f fakeStore) ResolveToken(context.Context, string) (db.TokenPrincipal, error) {
	if f.resolveErr != nil {
		return db.TokenPrincipal{}, f.resolveErr
	}
	kind := f.kind
	if kind == "" {
		kind = "pat"
	}
	return db.TokenPrincipal{UserID: "u1", Email: "u@example.com", Kind: kind, Scopes: f.scopes}, nil
}

// --- orgs -----------------------------------------------------------------------

func (f fakeStore) Me(_ context.Context, userID, email string) (db.User, []db.Org, error) {
	return db.User{ID: userID, Email: email}, []db.Org{{ID: testOrgID, Slug: "acme"}}, f.err
}
func (f fakeStore) ListOrgs(context.Context, string) ([]db.Org, error) {
	return []db.Org{{ID: testOrgID, Slug: "acme"}}, f.err
}
func (f fakeStore) CreateOrg(_ context.Context, _, _, name, slug string) (db.Org, error) {
	return db.Org{ID: testOrgID, Name: name, Slug: slug}, f.err
}
func (f fakeStore) UpdateOrg(_ context.Context, _, slug, name string) (db.Org, error) {
	return db.Org{ID: testOrgID, Name: name, Slug: slug}, f.err
}
func (f fakeStore) GetOrg(_ context.Context, _, slug string) (db.Org, error) {
	role := f.role
	if role == "" {
		role = db.RoleOwner
	}
	return db.Org{ID: testOrgID, Slug: slug, Role: role}, f.err
}
func (f fakeStore) OrgAccessState(context.Context, string, string, string) (db.OrgAccess, error) {
	return f.access, nil
}
func (f fakeStore) LeaveOrg(context.Context, string, string) error { return f.err }
func (f fakeStore) DeleteOrg(_ context.Context, _, slug string) (db.Org, []string, error) {
	return db.Org{ID: testOrgID, Slug: slug}, []string{"u1"}, f.err
}
func (f fakeStore) ListDeletedOrgs(context.Context, string) ([]db.DeletedOrg, error) {
	return []db.DeletedOrg{{ID: testOrgID, Slug: "acme"}}, f.err
}
func (f fakeStore) RestoreOrg(_ context.Context, _, orgID, newSlug string) (db.Org, error) {
	return db.Org{ID: orgID, Slug: newSlug}, f.err
}
func (f fakeStore) IsOrgMember(_ context.Context, _, orgID string) (bool, error) {
	return orgID == testOrgID, nil
}

// --- members + invitations --------------------------------------------------------

func (f fakeStore) ListMembers(context.Context, string, string, paginate.Query) ([]db.Member, string, error) {
	return []db.Member{{UserID: "u1", Email: "u@example.com", Role: "owner"}}, "", f.err
}
func (f fakeStore) AddMember(context.Context, string, string, string, string) (string, string, error) {
	return "u2", "Acme", f.err
}
func (f fakeStore) SetMemberRole(context.Context, string, string, string, string) error { return f.err }
func (f fakeStore) RemoveMember(context.Context, string, string, string) error          { return f.err }
func (f fakeStore) InviteMember(_ context.Context, _, _, login, role string) (db.InviteResult, error) {
	return db.InviteResult{Status: "invited", Email: login, OrgName: "Acme", Token: "flagon_inv_test",
		Invite: db.Invitation{ID: "i1", Email: login, Role: role}}, f.err
}
func (f fakeStore) ListInvitations(context.Context, string, string, paginate.Query) ([]db.Invitation, string, error) {
	return nil, "", f.err
}
func (f fakeStore) RevokeInvitation(context.Context, string, string, string) error { return f.err }
func (f fakeStore) InvitationByToken(context.Context, string) (*db.InviteLookup, error) {
	return &db.InviteLookup{OrgSlug: "acme"}, f.err
}
func (f fakeStore) AcceptInvitation(context.Context, string, string, string) (string, string, string, error) {
	return "acme", "Acme", "u9", f.err
}

// --- projects -----------------------------------------------------------------------

func (f fakeStore) ListProjects(_ context.Context, _, _ string, _ paginate.Query) ([]db.Project, string, error) {
	return []db.Project{{Slug: "web"}}, "", f.err
}
func (f fakeStore) ListDeletedProjects(context.Context, string, string, paginate.Query) ([]db.Project, string, error) {
	return []db.Project{{Slug: "old-web"}}, "", f.err
}
func (f fakeStore) CreateProject(_ context.Context, _, _ string, in db.ProjectInput) (db.Project, error) {
	return db.Project{Name: in.Name, Slug: in.Slug}, f.err
}
func (f fakeStore) GetProject(_ context.Context, _, _, projectSlug string) (db.Project, error) {
	return db.Project{Slug: projectSlug}, f.err
}
func (f fakeStore) UpdateProject(_ context.Context, _, _, projectSlug string, _ db.ProjectUpdate) (db.Project, error) {
	return db.Project{Slug: projectSlug}, f.err
}
func (f fakeStore) SetProjectDeleted(_ context.Context, _, _, projectSlug string, _ bool) (db.Project, error) {
	return db.Project{Slug: projectSlug}, f.err
}
func (f fakeStore) RestoreProject(_ context.Context, _, _, projectSlug, newSlug string) (db.Project, error) {
	if newSlug != "" {
		projectSlug = newSlug
	}
	return db.Project{Slug: projectSlug}, f.err
}
func (f fakeStore) ListProjectMembers(context.Context, string, string, string, paginate.Query) ([]db.ProjectMember, string, error) {
	return []db.ProjectMember{{UserID: "u1", Email: "u@example.com", Role: "admin"}}, "", f.err
}
func (f fakeStore) AddProjectMember(context.Context, string, string, string, string, string) (string, error) {
	return "u2", f.err
}
func (f fakeStore) SetProjectMemberRole(context.Context, string, string, string, string, string) error {
	return f.err
}
func (f fakeStore) RemoveProjectMember(context.Context, string, string, string, string) error {
	return f.err
}
func (f fakeStore) ListProjectTeams(context.Context, string, string, string, paginate.Query) ([]db.ProjectTeam, string, error) {
	return []db.ProjectTeam{{TeamID: "t1", Slug: "platform", Role: "write"}}, "", f.err
}
func (f fakeStore) AddProjectTeam(context.Context, string, string, string, string, string) error {
	return f.err
}
func (f fakeStore) SetProjectTeamRole(context.Context, string, string, string, string, string) error {
	return f.err
}
func (f fakeStore) RemoveProjectTeam(context.Context, string, string, string, string) error {
	return f.err
}
func (f fakeStore) ListProjectOwners(context.Context, string, string, string, paginate.Query) ([]db.ProjectOwner, string, error) {
	return []db.ProjectOwner{{OwnerType: "user", PrincipalID: "u1"}}, "", f.err
}
func (f fakeStore) AddProjectOwner(context.Context, string, string, string, string, string) (string, error) {
	return "u2", f.err
}
func (f fakeStore) RemoveProjectOwner(context.Context, string, string, string, string, string) error {
	return f.err
}

// --- teams --------------------------------------------------------------------------

func (f fakeStore) ListTeams(context.Context, string, string, paginate.Query) ([]db.Team, string, error) {
	return []db.Team{{ID: "t1", Name: "Platform", Slug: "platform"}}, "", f.err
}
func (f fakeStore) GetTeam(_ context.Context, _, _, teamSlug string) (db.Team, error) {
	return db.Team{Slug: teamSlug}, f.err
}
func (f fakeStore) CreateTeam(_ context.Context, _, _ string, in db.TeamInput) (db.Team, error) {
	return db.Team{Name: in.Name, Slug: in.Slug}, f.err
}
func (f fakeStore) UpdateTeam(_ context.Context, _, _, teamSlug string, _ db.TeamUpdate) (db.Team, error) {
	return db.Team{Slug: teamSlug}, f.err
}
func (f fakeStore) DeleteTeam(context.Context, string, string, string) error { return f.err }
func (f fakeStore) ListTeamMembers(context.Context, string, string, string, paginate.Query) ([]db.TeamMember, string, error) {
	return []db.TeamMember{{UserID: "u1", Email: "u@example.com", Role: "maintainer"}}, "", f.err
}
func (f fakeStore) ListTeamProjects(context.Context, string, string, string, paginate.Query) ([]db.TeamProject, string, error) {
	return []db.TeamProject{{ProjectID: "p1", Slug: "web", Role: "write"}}, "", f.err
}
func (f fakeStore) AddTeamMember(context.Context, string, string, string, string, string) (string, error) {
	return "u2", f.err
}
func (f fakeStore) SetTeamMemberRole(context.Context, string, string, string, string, string) error {
	return f.err
}
func (f fakeStore) RemoveTeamMember(context.Context, string, string, string, string) error {
	return f.err
}

// --- settings, audit, notifications ----------------------------------------------------

func (f fakeStore) GetAuditConfig(context.Context, string, string) (bool, error) { return false, f.err }
func (f fakeStore) SetAuditConfig(context.Context, string, string, bool) error   { return f.err }
func (f fakeStore) ListAuditLog(context.Context, string, string, int) ([]db.AuditEvent, error) {
	return []db.AuditEvent{{ID: "a1", Action: "project.created", Summary: "created project Web"}}, f.err
}
func (f fakeStore) GetOrgSecurity(context.Context, string, string) (db.OrgSecurity, error) {
	return db.OrgSecurity{BasePermission: "read"}, f.err
}
func (f fakeStore) SetOrgSecurity(context.Context, string, string, db.OrgSecurity) error {
	return f.err
}
func (f fakeStore) ListNotifications(context.Context, string, int) ([]db.Notification, error) {
	return []db.Notification{{ID: "n1", Type: "test", Title: "Hi"}}, f.err
}
func (f fakeStore) UnreadNotificationCount(context.Context, string) (int, error) { return 1, f.err }
func (f fakeStore) MarkNotificationRead(context.Context, string, string) error   { return f.err }
func (f fakeStore) MarkNotificationUnread(context.Context, string, string) error { return f.err }
func (f fakeStore) MarkAllNotificationsRead(context.Context, string) error       { return f.err }
func (f fakeStore) CreateNotification(_ context.Context, _ string, _ *string, ntype, _, _, _ string) error {
	if f.mu != nil {
		f.mu.Lock()
		*f.notes = append(*f.notes, ntype)
		f.mu.Unlock()
	}
	return nil
}

// --- transport-only (profile, tokens, SSO) ---------------------------------------------

func (f fakeStore) UpsertUserProfile(context.Context, string, string, db.ProfileInput) error {
	return f.err
}
func (f fakeStore) SetUserDeleted(context.Context, string, bool) error { return f.err }
func (f fakeStore) SetUserAuthState(context.Context, string, string, *bool, []string) error {
	return f.err
}
func (f fakeStore) RecordSSOSignIn(context.Context, string, string, string) error { return f.err }
func (f fakeStore) PublicUserProfile(context.Context, string) (*db.PublicProfile, error) {
	return &db.PublicProfile{Username: "u"}, f.err
}
func (f fakeStore) ProvisionSSOMember(context.Context, string, string, string, string) error {
	return f.err
}
func (f fakeStore) CreatePAT(context.Context, string, string, []string, *time.Time) (string, db.AccessToken, error) {
	return "flagon_pat_x", db.AccessToken{ID: "tok1"}, f.err
}
func (f fakeStore) CreateOAT(context.Context, string, string, string, string, []string, *time.Time) (string, string, error) {
	return "flagon_oat_x", "tok2", f.err
}
func (f fakeStore) ListPATs(context.Context, string) ([]db.AccessToken, error) { return nil, f.err }
func (f fakeStore) ListOATs(context.Context, string, string) ([]db.AccessToken, error) {
	return nil, f.err
}
func (f fakeStore) RevokePAT(context.Context, string, string) error { return f.err }
func (f fakeStore) RevokeOAT(context.Context, string, string) error { return f.err }

// errQuerier satisfies the audit store's read surface and always fails, so the
// audit-log endpoint is registered (and reachable for permission tests) without
// a database.
type errQuerier struct{}

func (errQuerier) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return nil, errors.New("no database in tests")
}
