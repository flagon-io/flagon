package server

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"

	"github.com/flagon-io/flagon/api/internal/db"
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
		{"notifications reads and writes", []string{"notifications"}, "read-all-notifications", true},
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
		{"read:project cannot create project", []string{"read:project"}, http.MethodPost, "/orgs/acme/projects", http.StatusForbidden},
		{"write:project creates project (implies read)", []string{"write:project"}, http.MethodPost, "/orgs/acme/projects", http.StatusOK},
		{"read:org lists invitations", []string{"read:org"}, http.MethodGet, "/orgs/acme/invitations", http.StatusOK},
		{"read:org cannot invite", []string{"read:org"}, http.MethodPost, "/orgs/acme/invitations", http.StatusForbidden},
		{"write:org invites (implies read)", []string{"write:org"}, http.MethodPost, "/orgs/acme/invitations", http.StatusOK},
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
		OperationID: "list-invitations", Method: http.MethodGet, Path: "/orgs/{slug}/invitations",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })

	huma.Register(api, huma.Operation{
		OperationID: "invite-member", Method: http.MethodPost, Path: "/orgs/{slug}/invitations",
		Middlewares: huma.Middlewares{auth},
	}, func(context.Context, *probeSlugInput) (*probeOK, error) { return &probeOK{}, nil })
}

type probeSlugInput struct {
	Slug string `path:"slug"`
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
func (scopeFakeStore) ListProjects(context.Context, string, string) ([]db.Project, error) {
	return nil, nil
}
func (scopeFakeStore) CreateProject(context.Context, string, string, db.ProjectInput) (db.Project, error) {
	return db.Project{}, nil
}
func (scopeFakeStore) GetProject(context.Context, string, string, string) (db.Project, error) {
	return db.Project{}, nil
}
func (scopeFakeStore) ListOrgs(context.Context, string) ([]db.Org, error) { return nil, nil }
func (scopeFakeStore) UpsertUserProfile(context.Context, string, string, db.ProfileInput) error {
	return nil
}
func (scopeFakeStore) PublicUserProfile(context.Context, string) (*db.PublicProfile, error) {
	return nil, nil
}
func (scopeFakeStore) LeaveOrg(context.Context, string, string) error { return nil }
func (scopeFakeStore) ListMembers(context.Context, string, string) ([]db.Member, error) {
	return nil, nil
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
func (scopeFakeStore) ListInvitations(context.Context, string, string) ([]db.Invitation, error) {
	return nil, nil
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
func (scopeFakeStore) ListPATs(context.Context, string) ([]db.AccessToken, error)         { return nil, nil }
func (scopeFakeStore) ListOATs(context.Context, string, string) ([]db.AccessToken, error) { return nil, nil }
func (scopeFakeStore) RevokePAT(context.Context, string, string) error                    { return nil }
func (scopeFakeStore) RevokeOAT(context.Context, string, string) error                    { return nil }
