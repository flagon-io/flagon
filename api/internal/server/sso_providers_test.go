package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
)

// The user-facing SSO surfaces (REST reads, and the agent/MCP tools) never carry a
// stored secret; only the app-only internal read does, and only with the internal
// token.
func TestSSOProviderSecretsStayInternal(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))

	for _, path := range []string{"/orgs/acme/sso/providers", "/orgs/acme/sso/providers/acme-okta"} {
		rec := s.call(http.MethodGet, path, "flagon_pat_full", "")
		if rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d (%s)", path, rec.Code, rec.Body.String())
		}
		body := rec.Body.String()
		if strings.Contains(body, fakeSSOSecret) || strings.Contains(body, `"client_secret"`) {
			t.Fatalf("GET %s leaked a secret: %s", path, body)
		}
		if !strings.Contains(body, `"client_secret_set":true`) {
			t.Fatalf("GET %s should report the secret as set: %s", path, body)
		}
	}

	// The internal read returns the secret to the app, with the internal token only.
	rec := s.call(http.MethodGet, "/internal/sso/providers?provider_id=acme-okta", testInternalToken, "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), fakeSSOSecret) {
		t.Fatalf("internal config read = %d %s, want 200 with the secret", rec.Code, rec.Body.String())
	}
	if rec := s.call(http.MethodGet, "/internal/sso/providers?provider_id=acme-okta", "flagon_pat_full", ""); rec.Code != http.StatusUnauthorized {
		t.Fatalf("internal config read with a user token = %d, want 401", rec.Code)
	}
	if rec := s.call(http.MethodGet, "/internal/sso/providers", testInternalToken, ""); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("unfiltered internal config read = %d, want 422", rec.Code)
	}
	if rec := s.call(http.MethodGet, "/internal/sso/providers?org_id=not-a-uuid", testInternalToken, ""); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("bad org_id = %d, want 422", rec.Code)
	}

	// The tools return the same masked shape.
	for _, name := range []string{"list_sso_providers", "get_sso_provider"} {
		tool, ok := s.registry.Get(name)
		if !ok {
			t.Fatalf("tool %s is not registered", name)
		}
		out, err := tool.Run(context.Background(), ai.ToolContext{UserID: "u1", Email: "u@example.com", OrgID: testOrgID}, json.RawMessage(`{"org":"acme","provider_id":"acme-okta"}`))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		raw, _ := json.Marshal(out)
		if strings.Contains(string(raw), fakeSSOSecret) || strings.Contains(string(raw), `"client_secret"`) {
			t.Fatalf("%s leaked a secret: %s", name, raw)
		}
	}
}

// A create through REST validates in the service (so the agent and MCP get the
// same rules) and never echoes the secret it was given.
func TestCreateSSOProviderValidatesAndMasks(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))

	bad := `{"provider_id":"Acme Okta!","type":"oidc","issuer":"https://idp.acme.com","oidc":{"client_id":"c","client_secret":"s"}}`
	if rec := s.call(http.MethodPost, "/orgs/acme/sso/providers", "flagon_pat_full", bad); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid provider_id = %d, want 422 (%s)", rec.Code, rec.Body.String())
	}
	noSecret := `{"provider_id":"acme-okta","type":"oidc","issuer":"https://idp.acme.com","oidc":{"client_id":"c","client_secret":""}}`
	if rec := s.call(http.MethodPost, "/orgs/acme/sso/providers", "flagon_pat_full", noSecret); rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("missing client secret = %d, want 422 (%s)", rec.Code, rec.Body.String())
	}

	good := `{"provider_id":"acme-okta","type":"oidc","domain":"acme.com","issuer":"https://idp.acme.com","oidc":{"client_id":"c","client_secret":"super-secret-value"}}`
	rec := s.call(http.MethodPost, "/orgs/acme/sso/providers", "flagon_pat_full", good)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create = %d (%s)", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); strings.Contains(body, "super-secret-value") || !strings.Contains(body, `"client_secret_set":true`) {
		t.Fatalf("create response must mask the secret: %s", body)
	}

	// The create tool's confirmation summary never includes the secret either.
	tool, _ := s.registry.Get("create_sso_provider")
	summary := tool.Summarize(json.RawMessage(`{"org":"acme","provider_id":"acme-okta","type":"oidc","issuer":"https://idp.acme.com","client_id":"c","client_secret":"super-secret-value"}`))
	if strings.Contains(summary, "super-secret-value") || summary == "" {
		t.Fatalf("summary = %q", summary)
	}
}
