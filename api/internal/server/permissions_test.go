package server

import (
	"net/http"
	"testing"
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
		{"no scope reaches the internal profile mirror", []string{"user", "admin:user"}, "sync-profile", false},
		{"read:project allows the QUERY twin of list-projects", []string{"read:project"}, "query-projects", true},
		{"read:org does not allow query-projects", []string{"read:org"}, "query-projects", false},
		{"read:org reads security policy", []string{"read:org"}, "get-org-security", true},
		{"read:org cannot set security policy", []string{"read:org"}, "set-org-security", false},
		{"write:org sets security policy", []string{"write:org"}, "set-org-security", true},
		{"read:org lists SSO providers", []string{"read:org"}, "list-sso-providers", true},
		{"read:org cannot add an SSO provider", []string{"read:org"}, "create-sso-provider", false},
		{"write:org removes an SSO provider", []string{"write:org"}, "delete-sso-provider", true},
		{"admin:project does not reach SSO providers", []string{"admin:project"}, "update-sso-provider", false},
		{"the SSO config read is never token-reachable", []string{"admin:org", "admin:user"}, "get-sso-provider-configs", false},
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

// TestEveryScopedOperationEnforcesItsScope drives EVERY scoped operation the
// server registers (GETs, writes, and the Hidden QUERY twins alike) through the
// real combinedAuth middleware and handler, twice: a token holding exactly the
// required scope must get past auth, and a token holding only an unrelated scope
// must be refused with 403. Because the operation list is enumerated from the
// server, a new endpoint is covered the moment it is registered.
func TestEveryScopedOperationEnforcesItsScope(t *testing.T) {
	for _, op := range newTestServer(t, newFakeStore(nil)).ops {
		required, scoped := operationScopes[op.OperationID]
		if !scoped {
			continue
		}
		path := concretePath(op.Path)

		allow := newTestServer(t, newFakeStore([]string{string(required)}))
		if rec := allow.call(op.Method, path, "flagon_pat_scoped", ""); authRejected(rec.Code) {
			t.Errorf("%s (%s %s) with %q = %d, want past auth (body: %s)",
				op.OperationID, op.Method, op.Path, required, rec.Code, rec.Body.String())
		}

		unrelated := ScopeNotifications
		if required == ScopeNotifications {
			unrelated = ScopeReadUser
		}
		deny := newTestServer(t, newFakeStore([]string{string(unrelated)}))
		if rec := deny.call(op.Method, path, "flagon_pat_scoped", ""); rec.Code != http.StatusForbidden {
			t.Errorf("%s (%s %s) with only %q = %d, want 403",
				op.OperationID, op.Method, op.Path, unrelated, rec.Code)
		}
	}
}

// TestEndpointScopeEnforcement pins the scope hierarchy at the HTTP layer with
// hand-picked cases (implication across levels, no leakage across resources),
// against the real routes and handlers. "allow" means the request got past the
// auth/scope layer (the handler's own answer is irrelevant here).
func TestEndpointScopeEnforcement(t *testing.T) {
	cases := []struct {
		name         string
		scopes       []string // nil = full-access token
		method, path string
		allow        bool
	}{
		{"read:org lists members", []string{"read:org"}, http.MethodGet, "/orgs/acme/members", true},
		{"read:org cannot add member", []string{"read:org"}, http.MethodPost, "/orgs/acme/members", false},
		{"admin:org adds member (implied)", []string{"admin:org"}, http.MethodPost, "/orgs/acme/members", true},
		{"read:org cannot read profile", []string{"read:org"}, http.MethodGet, "/me", false},
		{"admin:user reads profile (implied)", []string{"admin:user"}, http.MethodGet, "/me", true},
		{"write:org cannot leave org (needs admin:org)", []string{"write:org"}, http.MethodPost, "/orgs/acme/leave", false},
		{"admin:org leaves org", []string{"admin:org"}, http.MethodPost, "/orgs/acme/leave", true},
		{"write:org cannot delete org (needs admin:org)", []string{"write:org"}, http.MethodDelete, "/orgs/acme", false},
		{"admin:org deletes org", []string{"admin:org"}, http.MethodDelete, "/orgs/acme", true},
		{"read:org lists deleted orgs", []string{"read:org"}, http.MethodGet, "/deleted-orgs", true},
		{"read:project cannot list deleted orgs", []string{"read:project"}, http.MethodGet, "/deleted-orgs", false},
		{"write:org cannot restore org (needs admin:org)", []string{"write:org"}, http.MethodPost, "/deleted-orgs/" + testOrgID + "/restore", false},
		{"admin:org restores org", []string{"admin:org"}, http.MethodPost, "/deleted-orgs/" + testOrgID + "/restore", true},
		{"write:org updates org", []string{"write:org"}, http.MethodPatch, "/orgs/acme", true},
		{"read:org cannot update org", []string{"read:org"}, http.MethodPatch, "/orgs/acme", false},
		{"read:project gets project", []string{"read:project"}, http.MethodGet, "/orgs/acme/projects/web", true},
		{"read:project cannot create project", []string{"read:project"}, http.MethodPost, "/orgs/acme/projects", false},
		{"write:project creates project (implies read)", []string{"write:project"}, http.MethodPost, "/orgs/acme/projects", true},
		{"write:project cannot delete project (needs admin)", []string{"write:project"}, http.MethodDelete, "/orgs/acme/projects/web", false},
		{"admin:project restores project", []string{"admin:project"}, http.MethodPost, "/orgs/acme/projects/web/restore", true},
		{"read:project QUERY twin allowed", []string{"read:project"}, "QUERY", "/orgs/acme/projects", true},
		{"read:org QUERY twin of projects denied", []string{"read:org"}, "QUERY", "/orgs/acme/projects", false},
		{"read:project cannot read audit log", []string{"read:project"}, http.MethodGet, "/orgs/acme/audit", false},
		{"write:org sets audit config", []string{"write:org"}, http.MethodPut, "/orgs/acme/audit/config", true},
		{"read:org reads SSO providers", []string{"read:org"}, http.MethodGet, "/orgs/acme/sso/providers", true},
		{"read:org cannot update an SSO provider", []string{"read:org"}, http.MethodPatch, "/orgs/acme/sso/providers/acme-okta", false},
		{"admin:org adds an SSO provider (implied)", []string{"admin:org"}, http.MethodPost, "/orgs/acme/sso/providers", true},
		{"read:team does not leak to SSO providers", []string{"read:team"}, http.MethodGet, "/orgs/acme/sso/providers", false},
		{"read:team does not leak to projects", []string{"read:team"}, http.MethodGet, "/orgs/acme/projects/web/teams", false},
		{"write:team cannot delete team (needs admin)", []string{"write:team"}, http.MethodDelete, "/orgs/acme/teams/platform", false},
		{"admin:team deletes team", []string{"admin:team"}, http.MethodDelete, "/orgs/acme/teams/platform", true},
		{"notifications counts unread", []string{"notifications"}, http.MethodGet, "/notifications/unread-count", true},
		{"read:org cannot count notifications", []string{"read:org"}, http.MethodGet, "/notifications/unread-count", false},
		{"full access adds member", nil, http.MethodPost, "/orgs/acme/members", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := newTestServer(t, newFakeStore(tc.scopes))
			rec := s.call(tc.method, tc.path, "flagon_pat_test", "")
			if tc.allow && authRejected(rec.Code) {
				t.Fatalf("%s %s = %d, want past auth (body: %s)", tc.method, tc.path, rec.Code, rec.Body.String())
			}
			if !tc.allow && rec.Code != http.StatusForbidden {
				t.Fatalf("%s %s = %d, want 403", tc.method, tc.path, rec.Code)
			}
		})
	}
}
