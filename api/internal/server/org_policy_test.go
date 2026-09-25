package server

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/flagon-io/flagon/api/internal/db"
)

const testPAT = "flagon_pat_test"

// callWith issues a request like testServer.call, with extra headers.
func (s testServer) callWith(method, path, bearer, body string, hdr map[string]string) *httptest.ResponseRecorder {
	if body == "" {
		body = "{}"
	}
	req := httptest.NewRequestWithContext(context.Background(), method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if bearer == testInternalToken {
		req.Header.Set("X-Flagon-User-Id", "u1")
		req.Header.Set("X-Flagon-User-Email", "u@example.com")
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	s.handler.ServeHTTP(rec, req)
	return rec
}

func detail(rec *httptest.ResponseRecorder) string {
	var p struct {
		Detail string `json:"detail"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &p)
	return p.Detail
}

func TestOrgPolicy_TwoFactorRequired(t *testing.T) {
	enforcing := db.OrgAccess{Member: true, OrgID: testOrgID, Role: "member", EnforceTwoFactor: true}

	cases := []struct {
		name   string
		access db.OrgAccess
		kind   string
		bearer string
		want   int
	}{
		{"session without 2FA", enforcing, "", testInternalToken, http.StatusForbidden},
		{"PAT without 2FA", enforcing, "", testPAT, http.StatusForbidden},
		{"org token exempt", enforcing, "oat", testPAT, http.StatusOK},
		{"session with 2FA", func() db.OrgAccess { a := enforcing; a.UserTwoFactor = true; return a }(), "", testInternalToken, http.StatusOK},
		{"PAT with 2FA", func() db.OrgAccess { a := enforcing; a.UserTwoFactor = true; return a }(), "", testPAT, http.StatusOK},
		{"policy off", db.OrgAccess{Member: true, OrgID: testOrgID, Role: "member"}, "", testInternalToken, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore(nil)
			store.access, store.kind = tc.access, tc.kind
			s := newTestServer(t, store)
			rec := s.call(http.MethodGet, "/orgs/acme/projects", tc.bearer, "")
			if rec.Code != tc.want {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
			if tc.want == http.StatusForbidden && !strings.Contains(detail(rec), "two-factor") {
				t.Fatalf("403 should explain the 2FA requirement, got %q", detail(rec))
			}
		})
	}
}

func TestOrgPolicy_SSORequired(t *testing.T) {
	base := db.OrgAccess{Member: true, OrgID: testOrgID, Role: "member", RequireSSO: true, ProviderIDs: []string{"acme-okta"}}
	with := func(f func(*db.OrgAccess)) db.OrgAccess { a := base; f(&a); return a }

	cases := []struct {
		name   string
		access db.OrgAccess
		kind   string
		bearer string
		sso    string
		want   int
	}{
		{"session not via SSO", base, "", testInternalToken, "", http.StatusForbidden},
		{"session via another provider", base, "", testInternalToken, "other-idp", http.StatusForbidden},
		{"session via the org's provider", base, "", testInternalToken, "acme-okta", http.StatusOK},
		{"PAT without linked identity", base, "", testPAT, "", http.StatusForbidden},
		// A token caller can't claim an SSO session by sending the app's header.
		{"PAT forging the SSO header", base, "", testPAT, "acme-okta", http.StatusForbidden},
		{"PAT with linked identity", with(func(a *db.OrgAccess) { a.LinkedSSO = true }), "", testPAT, "", http.StatusOK},
		{"owner is exempt (break-glass)", with(func(a *db.OrgAccess) { a.Role = db.RoleOwner }), "", testInternalToken, "", http.StatusOK},
		{"org token exempt", base, "oat", testPAT, "", http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore(nil)
			store.access, store.kind = tc.access, tc.kind
			s := newTestServer(t, store)
			hdr := map[string]string{}
			if tc.sso != "" {
				hdr[SSOProviderHeader] = tc.sso
			}
			rec := s.callWith(http.MethodGet, "/orgs/acme/projects", tc.bearer, "", hdr)
			if rec.Code != tc.want {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.want, rec.Body.String())
			}
			if tc.want == http.StatusForbidden && !strings.Contains(detail(rec), "single sign-on") {
				t.Fatalf("403 should explain the SSO requirement, got %q", detail(rec))
			}
		})
	}
}

// Leaving is always allowed: it only removes access.
func TestOrgPolicy_LeaveExempt(t *testing.T) {
	store := newFakeStore(nil)
	store.access = db.OrgAccess{Member: true, OrgID: testOrgID, Role: "member", EnforceTwoFactor: true}
	s := newTestServer(t, store)
	if rec := s.call(http.MethodPost, "/orgs/acme/leave", testInternalToken, ""); rec.Code != http.StatusOK {
		t.Fatalf("leave-org should bypass the policy, got %d: %s", rec.Code, rec.Body.String())
	}
}

// The agent and MCP tool runner enforce the same policy for any tool naming an org.
func TestOrgPolicy_MCPTool(t *testing.T) {
	store := newFakeStore(nil)
	store.access = db.OrgAccess{Member: true, OrgID: testOrgID, Role: "member", EnforceTwoFactor: true}
	s := newTestServer(t, store)
	rec := s.call(http.MethodPost, "/mcp", testPAT,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_projects","arguments":{"org":"acme"}}}`)
	var body struct {
		Result struct {
			IsError bool `json:"isError"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if !body.Result.IsError || len(body.Result.Content) == 0 || !strings.Contains(body.Result.Content[0].Text, "two-factor") {
		t.Fatalf("MCP tool should be refused by the 2FA policy, got %s", rec.Body.String())
	}
}

func TestOrgPolicy_AIConversation(t *testing.T) {
	store := newFakeStore(nil)
	store.access = db.OrgAccess{Member: true, OrgID: testOrgID, Role: "member", EnforceTwoFactor: true}
	meter := &fakeMeter{}
	s := newAIServer(t, store, meter)
	rec := s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody(testOrgID))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("agent turn in a 2FA org without 2FA: status %d, want 403: %s", rec.Code, rec.Body.String())
	}
	if len(meter.records) != 0 {
		t.Fatalf("a refused turn must not be metered: %v", meter.records)
	}
}

// Org access tokens (service principals) can't do user-only, account-level work.
func TestServicePrincipal_UserOnlyOps(t *testing.T) {
	store := newFakeStore(nil)
	store.kind = "oat"
	s := newTestServer(t, store)
	for _, c := range []struct{ method, path, body string }{
		{http.MethodPost, "/orgs", `{"name":"Evil"}`},
		{http.MethodPost, "/orgs/acme/leave", ""},
	} {
		if rec := s.call(c.method, c.path, testPAT, c.body); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s as an org token: status %d, want 403: %s", c.method, c.path, rec.Code, rec.Body.String())
		}
	}
	// The same operations are open to a personal token.
	pat := newTestServer(t, newFakeStore(nil))
	if rec := pat.call(http.MethodPost, "/orgs", testPAT, `{"name":"Acme"}`); rec.Code != http.StatusCreated {
		t.Fatalf("create-org with a PAT: status %d: %s", rec.Code, rec.Body.String())
	}
}

// Only the app gateway may write the profile mirror: the profile (username
// included) and the 2FA/SSO state are owned by the app's auth layer, so any
// access token, personal or org, full-access or not, is turned away.
func TestSyncProfile_AppOnly(t *testing.T) {
	for _, kind := range []string{"pat", "oat"} {
		store := newFakeStore(nil) // full-access token
		store.kind = kind
		s := newTestServer(t, store)
		for _, body := range []string{`{"username":"taken"}`, `{"name":"U","twoFactorEnabled":true,"ssoProviderIds":["acme-okta"]}`} {
			if rec := s.call(http.MethodPut, "/me/profile", testPAT, body); rec.Code != http.StatusUnauthorized {
				t.Fatalf("%s writing the profile mirror (%s): status %d, want 401", kind, body, rec.Code)
			}
		}
	}
	s := newTestServer(t, newFakeStore(nil))
	body := `{"username":"u","name":"U","twoFactorEnabled":true,"ssoProviderIds":["acme-okta"]}`
	if rec := s.call(http.MethodPut, "/me/profile", testInternalToken, body); rec.Code != http.StatusOK {
		t.Fatalf("app mirroring the profile: status %d: %s", rec.Code, rec.Body.String())
	}
}

// The audit log is admin-only: a plain member gets 403, not an empty page.
func TestAuditLog_MemberForbidden(t *testing.T) {
	store := newFakeStore(nil)
	store.role = "member"
	s := newTestServer(t, store)
	if rec := s.call(http.MethodGet, "/orgs/acme/audit", testInternalToken, ""); rec.Code != http.StatusForbidden {
		t.Fatalf("member reading the audit log: status %d, want 403", rec.Code)
	}
	store.role = db.RoleAdmin
	s = newTestServer(t, store)
	if rec := s.call(http.MethodGet, "/orgs/acme/audit", testInternalToken, ""); rec.Code == http.StatusForbidden {
		t.Fatalf("admin reading the audit log must pass the role check: %s", rec.Body.String())
	}
}
