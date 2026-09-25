package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// fakeMeter allows every call and records usage, or fails Record with err.
type fakeMeter struct {
	mu      sync.Mutex
	records []string // org ids recorded
	err     error
}

func (m *fakeMeter) Allowed(context.Context, string, string) (bool, error) { return true, nil }
func (m *fakeMeter) Record(_ context.Context, _, orgID, _ string, _, _ int) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return m.err
	}
	m.records = append(m.records, orgID)
	return nil
}

// newAIServer builds the real server with the offline mock agent over the fake
// store, sharing one service so tool runs go through the same code as REST.
func newAIServer(t *testing.T, store fakeStore, meter *fakeMeter) testServer {
	t.Helper()
	registry := ai.NewRegistry(service.New(store), nil)
	agent := ai.NewAgent(ai.NewMock(""), registry, meter)
	return newTestServer(t, store, WithAI(agent))
}

func aiMessageBody(orgID string) string {
	b, _ := json.Marshal(map[string]any{
		"org_id":   orgID,
		"messages": []map[string]string{{"role": "user", "content": "hello"}},
	})
	return string(b)
}

func aiExecuteBody(orgID, tool string, input map[string]any) string {
	b, _ := json.Marshal(map[string]any{"org_id": orgID, "tool": tool, "input": input})
	return string(b)
}

func TestAIMessages_RejectsNonMemberOrg(t *testing.T) {
	meter := &fakeMeter{}
	s := newAIServer(t, newFakeStore(nil), meter)
	// A foreign org (well-formed id, not the caller's) is a 404, and the agent
	// never runs, so nothing is metered against it.
	rec := s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody("22222222-2222-2222-2222-222222222222"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("non-member org = %d, want 404 (body: %s)", rec.Code, rec.Body.String())
	}
	// A malformed id is not a member either.
	rec = s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody("not-a-uuid"))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("malformed org id = %d, want 404", rec.Code)
	}
	// Missing org entirely is a validation error.
	rec = s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody(""))
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("empty org id = %d, want 422", rec.Code)
	}
	if len(meter.records) != 0 {
		t.Fatalf("rejected requests must not be metered, got %v", meter.records)
	}
}

func TestAIMessages_MemberOrgIsMetered(t *testing.T) {
	meter := &fakeMeter{}
	s := newAIServer(t, newFakeStore(nil), meter)
	rec := s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody(testOrgID))
	if rec.Code != http.StatusOK {
		t.Fatalf("member org = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	if len(meter.records) != 1 || meter.records[0] != testOrgID {
		t.Fatalf("turn should be metered once against the org, got %v", meter.records)
	}
}

func TestAIMessages_MeteringFailureFailsClosed(t *testing.T) {
	meter := &fakeMeter{err: errors.New("insert rejected by policy")}
	s := newAIServer(t, newFakeStore(nil), meter)
	rec := s.call(http.MethodPost, "/ai/messages", testInternalToken, aiMessageBody(testOrgID))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("unrecorded usage = %d, want 503 (fail closed)", rec.Code)
	}
}

func TestAIExecute_RejectsNonMemberOrg(t *testing.T) {
	s := newAIServer(t, newFakeStore(nil), &fakeMeter{})
	rec := s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody("22222222-2222-2222-2222-222222222222", "delete_project", map[string]any{"org": "acme", "project": "web"}))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("non-member org = %d, want 404 (body: %s)", rec.Code, rec.Body.String())
	}
}

func TestAIExecute_ReturnsTheRealStatus(t *testing.T) {
	cases := []struct {
		name     string
		storeErr error
		tool     string
		input    map[string]any
		want     int
	}{
		{"success", nil, "delete_project", map[string]any{"org": "acme", "project": "web"}, http.StatusOK},
		{"forbidden", db.ErrForbidden, "delete_project", map[string]any{"org": "acme", "project": "web"}, http.StatusForbidden},
		{"not found", db.ErrProjectNotFound, "delete_project", map[string]any{"org": "acme", "project": "web"}, http.StatusNotFound},
		{"conflict", db.ErrProjectSlugTaken, "create_project", map[string]any{"org": "acme", "name": "Web"}, http.StatusConflict},
		{"invalid role", db.ErrInvalidRole, "set_member_role", map[string]any{"org": "acme", "user_id": "u2", "role": "boss"}, http.StatusUnprocessableEntity},
		{"missing argument", nil, "delete_project", map[string]any{"org": "acme"}, http.StatusUnprocessableEntity},
		{"internal fault", errors.New("connection reset"), "delete_project", map[string]any{"org": "acme", "project": "web"}, http.StatusInternalServerError},
		{"unknown tool", nil, "drop_everything", map[string]any{}, http.StatusBadRequest},
		{"read tool is not executable", nil, "list_projects", map[string]any{"org": "acme"}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore(nil)
			store.err = tc.storeErr
			s := newAIServer(t, store, &fakeMeter{})
			rec := s.call(http.MethodPost, "/ai/actions/execute", testInternalToken, aiExecuteBody(testOrgID, tc.tool, tc.input))
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// TestAIExecute_EmitsSameNotificationsAsREST proves the agent path and the REST
// path share one implementation: adding a member through either notifies them.
func TestAIExecute_EmitsSameNotificationsAsREST(t *testing.T) {
	viaTool := newFakeStore(nil)
	s := newAIServer(t, viaTool, &fakeMeter{})
	rec := s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody(testOrgID, "add_member", map[string]any{"org": "acme", "login": "sam@example.com"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("add_member via agent = %d (body: %s)", rec.Code, rec.Body.String())
	}

	viaREST := newFakeStore(nil)
	s = newTestServer(t, viaREST)
	rec = s.call(http.MethodPost, "/orgs/acme/members", testInternalToken, `{"login":"sam@example.com"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("add-member via REST = %d (body: %s)", rec.Code, rec.Body.String())
	}

	tool, rest := viaTool.notifications(), viaREST.notifications()
	if len(tool) != 1 || len(rest) != 1 || tool[0] != rest[0] || tool[0] != "org.member_added" {
		t.Fatalf("notifications differ: agent=%v rest=%v", tool, rest)
	}
}
