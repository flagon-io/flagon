package server

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// TestScopeAllows locks down the classic-token rules directly: implication
// (a parent scope grants its children), no leakage across resources, and
// fail-closed on operations that aren't mapped.
func TestScopeAllows(t *testing.T) {
	cases := []struct {
		name  string
		held  []string
		op    string
		allow bool
	}{
		{"read:org lists members", []string{"read:org"}, "list-members", true},
		{"read:org cannot write members", []string{"read:org"}, "add-member", false},
		{"read:org does not leak to account", []string{"read:org"}, "get-me", false},
		{"write:org implies read:org", []string{"write:org"}, "list-members", true},
		{"admin:org implies write:org", []string{"admin:org"}, "add-member", true},
		{"admin:org implies read:org", []string{"admin:org"}, "list-members", true},
		{"admin:org creates orgs", []string{"admin:org"}, "create-org", true},
		{"admin:user implies read:user", []string{"admin:user"}, "get-me", true},
		{"user does not imply admin:user-only ops", []string{"user"}, "get-me", true},
		{"read:user cannot write profile", []string{"read:user"}, "sync-profile", false},
		{"read:project allows the QUERY twin of list-projects", []string{"read:project"}, "query-projects", true},
		{"read:org does not allow query-projects", []string{"read:org"}, "query-projects", false},
		{"read:org reads security policy", []string{"read:org"}, "get-org-security", true},
		{"read:org cannot set security policy", []string{"read:org"}, "set-org-security", false},
		{"write:org sets security policy", []string{"write:org"}, "set-org-security", true},
		{"notifications reads and writes", []string{"notifications"}, "read-all-notifications", true},
		{"notifications scope marks unread", []string{"notifications"}, "unread-notification", true},
		{"read:org cannot mark notifications unread", []string{"read:org"}, "unread-notification", false},
		{"unmapped operation is denied (fail closed)", []string{"admin:org", "admin:user"}, "delete-universe", false},
		{"empty scope set grants nothing", []string{}, "get-me", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := scopeAllows(tc.held, tc.op); got != tc.allow {
				t.Fatalf("scopeAllows(%v, %q) = %v, want %v", tc.held, tc.op, got, tc.allow)
			}
		})
	}
}

// TestEveryOperationScopeIsValid guards the invariant that every required scope
// is a real, selectable scope (so the create UI can always render it).
func TestEveryOperationScopeIsValid(t *testing.T) {
	for op, scope := range operationScopes {
		if !validScope(string(scope)) {
			t.Errorf("operation %q requires unknown scope %q", op, scope)
		}
	}
}

// TestEndpointScopeEnforcement drives the SAME scope logic through the real
// combinedAuth middleware and huma operations, so we prove it end to end at the
// HTTP layer, not just in the helper. This is the pattern to copy for any new
// endpoint: register it with combinedAuth, then assert the status a scoped token
// gets. A nil scope list means "full access" (bounded only by role).
func TestEndpointScopeEnforcement(t *testing.T) {
	cases := []struct {
		name         string
		scopes       []string // nil = full-access token
		method, path string
		want         int
	}{
		{"read:org lists members", []string{"read:org"}, http.MethodGet, "/orgs/acme/members", http.StatusOK},
		{"read:org cannot add member", []string{"read:org"}, http.MethodPost, "/orgs/acme/members", http.StatusForbidden},
		{"admin:org adds member (implied)", []string{"admin:org"}, http.MethodPost, "/orgs/acme/members", http.StatusOK},
		{"read:org cannot read profile", []string{"read:org"}, http.MethodGet, "/me", http.StatusForbidden},
		{"admin:user reads profile (implied)", []string{"admin:user"}, http.MethodGet, "/me", http.StatusOK},
		{"read:project lists projects", []string{"read:project"}, http.MethodGet, "/orgs/acme/projects", http.StatusOK},
		{"read:project lists deleted projects", []string{"read:project"}, http.MethodGet, "/orgs/acme/deleted-projects", http.StatusOK},
		{"read:project cannot create project", []string{"read:project"}, http.MethodPost, "/orgs/acme/projects", http.StatusForbidden},
		{"write:project creates project (implies read)", []string{"write:project"}, http.MethodPost, "/orgs/acme/projects", http.StatusOK},
		{"read:project cannot update project", []string{"read:project"}, http.MethodPatch, "/orgs/acme/projects/web", http.StatusForbidden},
		{"write:project updates project", []string{"write:project"}, http.MethodPatch, "/orgs/acme/projects/web", http.StatusOK},
		{"write:project cannot delete project (needs admin)", []string{"write:project"}, http.MethodDelete, "/orgs/acme/projects/web", http.StatusForbidden},
		{"admin:project deletes project", []string{"admin:project"}, http.MethodDelete, "/orgs/acme/projects/web", http.StatusOK},
		{"admin:project restores project", []string{"admin:project"}, http.MethodPost, "/orgs/acme/projects/web/restore", http.StatusOK},
		{"read:project lists collaborators", []string{"read:project"}, http.MethodGet, "/orgs/acme/projects/web/members", http.StatusOK},
		{"write:project cannot add collaborator (needs admin)", []string{"write:project"}, http.MethodPost, "/orgs/acme/projects/web/members", http.StatusForbidden},
		{"admin:project adds collaborator (implies read)", []string{"admin:project"}, http.MethodPost, "/orgs/acme/projects/web/members", http.StatusOK},
		{"admin:project sets collaborator role", []string{"admin:project"}, http.MethodPut, "/orgs/acme/projects/web/members/u9/role", http.StatusOK},
		{"admin:project removes collaborator", []string{"admin:project"}, http.MethodDelete, "/orgs/acme/projects/web/members/u9", http.StatusOK},
		{"read:org lists audit log", []string{"read:org"}, http.MethodGet, "/orgs/acme/audit", http.StatusOK},
		{"read:project cannot read audit log", []string{"read:project"}, http.MethodGet, "/orgs/acme/audit", http.StatusForbidden},
		{"read:org reads audit config", []string{"read:org"}, http.MethodGet, "/orgs/acme/audit/config", http.StatusOK},
		{"read:org cannot set audit config", []string{"read:org"}, http.MethodPut, "/orgs/acme/audit/config", http.StatusForbidden},
		{"write:org sets audit config", []string{"write:org"}, http.MethodPut, "/orgs/acme/audit/config", http.StatusOK},
		{"read:org lists invitations", []string{"read:org"}, http.MethodGet, "/orgs/acme/invitations", http.StatusOK},
		{"read:org cannot invite", []string{"read:org"}, http.MethodPost, "/orgs/acme/invitations", http.StatusForbidden},
		{"write:org invites (implies read)", []string{"write:org"}, http.MethodPost, "/orgs/acme/invitations", http.StatusOK},
		{"read:org reads security policy", []string{"read:org"}, http.MethodGet, "/orgs/acme/security", http.StatusOK},
		{"read:org cannot set security policy", []string{"read:org"}, http.MethodPut, "/orgs/acme/security", http.StatusForbidden},
		{"write:org sets security policy", []string{"write:org"}, http.MethodPut, "/orgs/acme/security", http.StatusOK},
		{"read:team lists teams", []string{"read:team"}, http.MethodGet, "/orgs/acme/teams", http.StatusOK},
		{"read:team cannot create team", []string{"read:team"}, http.MethodPost, "/orgs/acme/teams", http.StatusForbidden},
		{"write:team creates team (implies read)", []string{"write:team"}, http.MethodPost, "/orgs/acme/teams", http.StatusOK},
		{"write:team cannot delete team (needs admin)", []string{"write:team"}, http.MethodDelete, "/orgs/acme/teams/platform", http.StatusForbidden},
		{"admin:team deletes team", []string{"admin:team"}, http.MethodDelete, "/orgs/acme/teams/platform", http.StatusOK},
		{"write:team adds team member", []string{"write:team"}, http.MethodPost, "/orgs/acme/teams/platform/members", http.StatusOK},
		{"read:team lists team projects", []string{"read:team"}, http.MethodGet, "/orgs/acme/teams/platform/projects", http.StatusOK},
		{"read:team does not leak to projects", []string{"read:team"}, http.MethodGet, "/orgs/acme/projects/web/teams", http.StatusForbidden},
		{"read:project lists project teams", []string{"read:project"}, http.MethodGet, "/orgs/acme/projects/web/teams", http.StatusOK},
		{"write:project cannot grant team (needs admin)", []string{"write:project"}, http.MethodPost, "/orgs/acme/projects/web/teams", http.StatusForbidden},
		{"admin:project grants team", []string{"admin:project"}, http.MethodPost, "/orgs/acme/projects/web/teams", http.StatusOK},
		{"read:project lists owners", []string{"read:project"}, http.MethodGet, "/orgs/acme/projects/web/owners", http.StatusOK},
		{"admin:project adds owner", []string{"admin:project"}, http.MethodPost, "/orgs/acme/projects/web/owners", http.StatusOK},
		{"full access adds member", nil, http.MethodPost, "/orgs/acme/members", http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, api := humatest.New(t)
			registerScopeProbe(api, scopeFakeStore{scopes: tc.scopes})

			hdr := "Authorization: Bearer flagon_pat_test"
			var resp = api.Do(tc.method, tc.path, hdr, map[string]any{})
			if resp.Code != tc.want {
				t.Fatalf("%s %s = %d, want %d (body: %s)", tc.method, tc.path, resp.Code, tc.want, resp.Body.String())
			}
		})
	}
}

// registerScopeProbe registers trivial handlers under the REAL operation IDs,
// each guarded by combinedAuth. Handlers always succeed, so any non-200 comes
// from the auth/scope middleware, isolating exactly what we want to test.
func registerScopeProbe(api huma.API, store IdentityStore) {
	auth := combinedAuth(api, store, "internal-token")
	huma.Register(api, huma.Operation{
		OperationID: "get-me", Method: http.MethodGet, Path: "/me",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *struct{}) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "list-members", Method: http.MethodGet, Path: "/orgs/{slug}/members",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "add-member", Method: http.MethodPost, Path: "/orgs/{slug}/members",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "list-projects", Method: http.MethodGet, Path: "/orgs/{slug}/projects",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "create-project", Method: http.MethodPost, Path: "/orgs/{slug}/projects",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "list-deleted-projects", Method: http.MethodGet, Path: "/orgs/{slug}/deleted-projects",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "update-project", Method: http.MethodPatch, Path: "/orgs/{slug}/projects/{project}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "delete-project", Method: http.MethodDelete, Path: "/orgs/{slug}/projects/{project}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "restore-project", Method: http.MethodPost, Path: "/orgs/{slug}/projects/{project}/restore",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "list-project-members", Method: http.MethodGet, Path: "/orgs/{slug}/projects/{project}/members",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "add-project-member", Method: http.MethodPost, Path: "/orgs/{slug}/projects/{project}/members",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "set-project-member-role", Method: http.MethodPut, Path: "/orgs/{slug}/projects/{project}/members/{userId}/role",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectMemberInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-member", Method: http.MethodDelete, Path: "/orgs/{slug}/projects/{project}/members/{userId}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectMemberInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "list-invitations", Method: http.MethodGet, Path: "/orgs/{slug}/invitations",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "list-audit-log", Method: http.MethodGet, Path: "/orgs/{slug}/audit",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "get-audit-config", Method: http.MethodGet, Path: "/orgs/{slug}/audit/config",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "set-audit-config", Method: http.MethodPut, Path: "/orgs/{slug}/audit/config",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "invite-member", Method: http.MethodPost, Path: "/orgs/{slug}/invitations",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "get-org-security", Method: http.MethodGet, Path: "/orgs/{slug}/security",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "set-org-security", Method: http.MethodPut, Path: "/orgs/{slug}/security",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	// Teams.
	huma.Register(api, huma.Operation{
		OperationID: "list-teams", Method: http.MethodGet, Path: "/orgs/{slug}/teams",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "create-team", Method: http.MethodPost, Path: "/orgs/{slug}/teams",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "get-team", Method: http.MethodGet, Path: "/orgs/{slug}/teams/{team}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "update-team", Method: http.MethodPatch, Path: "/orgs/{slug}/teams/{team}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "delete-team", Method: http.MethodDelete, Path: "/orgs/{slug}/teams/{team}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "list-team-members", Method: http.MethodGet, Path: "/orgs/{slug}/teams/{team}/members",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "list-team-projects", Method: http.MethodGet, Path: "/orgs/{slug}/teams/{team}/projects",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "add-team-member", Method: http.MethodPost, Path: "/orgs/{slug}/teams/{team}/members",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "set-team-member-role", Method: http.MethodPut, Path: "/orgs/{slug}/teams/{team}/members/{userId}/role",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamMemberInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "remove-team-member", Method: http.MethodDelete, Path: "/orgs/{slug}/teams/{team}/members/{userId}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeTeamMemberInput) (*probeOK, error) { return &probeOK{}, nil })

	// Project teams & owners.
	huma.Register(api, huma.Operation{
		OperationID: "list-project-teams", Method: http.MethodGet, Path: "/orgs/{slug}/projects/{project}/teams",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "add-project-team", Method: http.MethodPost, Path: "/orgs/{slug}/projects/{project}/teams",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "set-project-team-role", Method: http.MethodPut, Path: "/orgs/{slug}/projects/{project}/teams/{team}/role",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "remove-project-team", Method: http.MethodDelete, Path: "/orgs/{slug}/projects/{project}/teams/{team}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectTeamInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "list-project-owners", Method: http.MethodGet, Path: "/orgs/{slug}/projects/{project}/owners",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "add-project-owner", Method: http.MethodPost, Path: "/orgs/{slug}/projects/{project}/owners",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeProjectInput) (*probeOK, error) { return &probeOK{}, nil })
	huma.Register(api, huma.Operation{
		OperationID: "remove-project-owner", Method: http.MethodDelete, Path: "/orgs/{slug}/projects/{project}/owners/{type}/{principalId}",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeOwnerInput) (*probeOK, error) { return &probeOK{}, nil })
}

type probeSlugInput struct {
	Slug string `path:"slug"`
}

type probeProjectInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
}

type probeProjectMemberInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	UserID  string `path:"userId"`
}

type probeTeamInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
}

type probeTeamMemberInput struct {
	Slug   string `path:"slug"`
	Team   string `path:"team"`
	UserID string `path:"userId"`
}

type probeProjectTeamInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Team    string `path:"team"`
}

type probeOwnerInput struct {
	Slug        string `path:"slug"`
	Project     string `path:"project"`
	Type        string `path:"type"`
	PrincipalID string `path:"principalId"`
}

// probeOK gives the probe handlers a body so a permitted request is a plain 200
// (an empty struct would return 204, muddying the assertion).
type probeOK struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

// scopeFakeStore satisfies IdentityStore. Only ResolveToken is meaningful: it
// returns a principal carrying the scopes under test. Everything else is a
// no-op the probe handlers never reach.
type scopeFakeStore struct{ scopes []string }

func (s scopeFakeStore) ResolveToken(context.Context, string) (db.TokenPrincipal, error) {
	return db.TokenPrincipal{UserID: "u1", Email: "u@example.com", Kind: "pat", Scopes: s.scopes}, nil
}

func (scopeFakeStore) Me(context.Context, string, string) (db.User, []db.Org, error) {
	return db.User{}, nil, nil
}
func (scopeFakeStore) CreateOrg(context.Context, string, string, string, string) (db.Org, error) {
	return db.Org{}, nil
}
func (scopeFakeStore) UpdateOrg(context.Context, string, string, string) (db.Org, error) {
	return db.Org{}, nil
}
func (scopeFakeStore) SetUserDeleted(context.Context, string, bool) error { return nil }
func (scopeFakeStore) ListProjects(context.Context, string, string, paginate.Query) ([]db.Project, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) ListDeletedProjects(context.Context, string, string, paginate.Query) ([]db.Project, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) CreateProject(context.Context, string, string, db.ProjectInput) (db.Project, error) {
	return db.Project{}, nil
}
func (scopeFakeStore) GetProject(context.Context, string, string, string) (db.Project, error) {
	return db.Project{}, nil
}
func (scopeFakeStore) UpdateProject(context.Context, string, string, string, db.ProjectUpdate) (db.Project, error) {
	return db.Project{}, nil
}
func (scopeFakeStore) SetProjectDeleted(context.Context, string, string, string, bool) (db.Project, error) {
	return db.Project{}, nil
}
func (scopeFakeStore) ListProjectMembers(context.Context, string, string, string, paginate.Query) ([]db.ProjectMember, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) AddProjectMember(context.Context, string, string, string, string, string) (string, error) {
	return "", nil
}
func (scopeFakeStore) SetProjectMemberRole(context.Context, string, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) RemoveProjectMember(context.Context, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) ListTeams(context.Context, string, string, paginate.Query) ([]db.Team, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) GetTeam(context.Context, string, string, string) (db.Team, error) {
	return db.Team{}, nil
}
func (scopeFakeStore) CreateTeam(context.Context, string, string, db.TeamInput) (db.Team, error) {
	return db.Team{}, nil
}
func (scopeFakeStore) UpdateTeam(context.Context, string, string, string, db.TeamUpdate) (db.Team, error) {
	return db.Team{}, nil
}
func (scopeFakeStore) DeleteTeam(context.Context, string, string, string) error { return nil }
func (scopeFakeStore) ListTeamMembers(context.Context, string, string, string, paginate.Query) ([]db.TeamMember, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) ListTeamProjects(context.Context, string, string, string, paginate.Query) ([]db.TeamProject, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) AddTeamMember(context.Context, string, string, string, string, string) (string, error) {
	return "", nil
}
func (scopeFakeStore) SetTeamMemberRole(context.Context, string, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) RemoveTeamMember(context.Context, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) ListProjectTeams(context.Context, string, string, string, paginate.Query) ([]db.ProjectTeam, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) AddProjectTeam(context.Context, string, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) SetProjectTeamRole(context.Context, string, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) RemoveProjectTeam(context.Context, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) ListProjectOwners(context.Context, string, string, string, paginate.Query) ([]db.ProjectOwner, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) AddProjectOwner(context.Context, string, string, string, string, string) (string, error) {
	return "", nil
}
func (scopeFakeStore) RemoveProjectOwner(context.Context, string, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) GetOrg(context.Context, string, string) (db.Org, error) {
	return db.Org{}, nil
}
func (scopeFakeStore) GetAuditConfig(context.Context, string, string) (bool, error) {
	return false, nil
}
func (scopeFakeStore) SetAuditConfig(context.Context, string, string, bool) error { return nil }
func (scopeFakeStore) GetOrgSecurity(context.Context, string, string) (db.OrgSecurity, error) {
	return db.OrgSecurity{}, nil
}
func (scopeFakeStore) SetOrgSecurity(context.Context, string, string, db.OrgSecurity) error {
	return nil
}
func (scopeFakeStore) ProvisionSSOMember(context.Context, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) ListOrgs(context.Context, string) ([]db.Org, error) { return nil, nil }
func (scopeFakeStore) UpsertUserProfile(context.Context, string, string, db.ProfileInput) error {
	return nil
}
func (scopeFakeStore) PublicUserProfile(context.Context, string) (*db.PublicProfile, error) {
	return nil, nil
}
func (scopeFakeStore) LeaveOrg(context.Context, string, string) error { return nil }
func (scopeFakeStore) ListMembers(context.Context, string, string, paginate.Query) ([]db.Member, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) AddMember(context.Context, string, string, string, string) (string, string, error) {
	return "", "", nil
}
func (scopeFakeStore) SetMemberRole(context.Context, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) RemoveMember(context.Context, string, string, string) error { return nil }
func (scopeFakeStore) InviteMember(context.Context, string, string, string, string) (db.InviteResult, error) {
	return db.InviteResult{}, nil
}
func (scopeFakeStore) ListInvitations(context.Context, string, string, paginate.Query) ([]db.Invitation, string, error) {
	return nil, "", nil
}
func (scopeFakeStore) RevokeInvitation(context.Context, string, string, string) error { return nil }
func (scopeFakeStore) InvitationByToken(context.Context, string) (*db.InviteLookup, error) {
	return nil, nil
}
func (scopeFakeStore) AcceptInvitation(context.Context, string, string, string) (string, string, string, error) {
	return "", "", "", nil
}
func (scopeFakeStore) ListNotifications(context.Context, string, int) ([]db.Notification, error) {
	return nil, nil
}
func (scopeFakeStore) UnreadNotificationCount(context.Context, string) (int, error) { return 0, nil }
func (scopeFakeStore) MarkNotificationRead(context.Context, string, string) error   { return nil }
func (scopeFakeStore) MarkNotificationUnread(context.Context, string, string) error { return nil }
func (scopeFakeStore) MarkAllNotificationsRead(context.Context, string) error       { return nil }
func (scopeFakeStore) CreateNotification(context.Context, string, *string, string, string, string, string) error {
	return nil
}
func (scopeFakeStore) CreatePAT(context.Context, string, string, []string, *time.Time) (string, db.AccessToken, error) {
	return "", db.AccessToken{}, nil
}
func (scopeFakeStore) CreateOAT(context.Context, string, string, string, string, []string, *time.Time) (string, string, error) {
	return "", "", nil
}
func (scopeFakeStore) ListPATs(context.Context, string) ([]db.AccessToken, error) { return nil, nil }
func (scopeFakeStore) ListOATs(context.Context, string, string) ([]db.AccessToken, error) {
	return nil, nil
}
func (scopeFakeStore) RevokePAT(context.Context, string, string) error { return nil }
func (scopeFakeStore) RevokeOAT(context.Context, string, string) error { return nil }
