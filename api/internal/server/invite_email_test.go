package server

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/mail"
	"github.com/flagon-io/flagon/api/internal/service"
)

// fakeMailer records every message, or fails with err.
type fakeMailer struct {
	mu   sync.Mutex
	sent []mail.Message
	err  error
}

func (m *fakeMailer) Delivers() bool { return true }

func (m *fakeMailer) Send(_ context.Context, msg mail.Message) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.err != nil {
		return m.err
	}
	m.sent = append(m.sent, msg)
	return nil
}

// Every front door that invites (REST and the agent/MCP tool) sends the same
// invitation email from the service, exactly once per invitation.
func TestInviteMember_EveryFrontDoorSendsTheEmail(t *testing.T) {
	mailer := &fakeMailer{}
	opt := service.WithMailer(mailer, "https://app.example.com/")
	store := newFakeStore(nil)
	agent := ai.NewAgent(ai.NewMock(""), ai.NewRegistry(service.New(store, opt), nil), &fakeMeter{})
	s := newTestServer(t, store, WithAI(agent), WithServiceOptions(opt))

	// REST.
	rec := s.call(http.MethodPost, "/orgs/acme/invitations", testInternalToken, `{"login":"new@example.com","role":"member"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("invite-member = %d, want 201 (body: %s)", rec.Code, rec.Body.String())
	}
	var body struct {
		Status    string `json:"status"`
		Token     string `json:"token"`
		EmailSent *bool  `json:"email_sent"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Status != "invited" || body.Token == "" || body.EmailSent == nil || !*body.EmailSent {
		t.Fatalf("REST body = %s, want invited with token and email_sent=true", rec.Body.String())
	}

	// The confirmed agent/MCP tool.
	rec = s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody(testOrgID, "invite_member", map[string]any{"org": "acme", "email": "other@example.com"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("invite_member tool = %d, want 200 (body: %s)", rec.Code, rec.Body.String())
	}
	if strings.Contains(rec.Body.String(), "flagon_inv_test") {
		t.Fatal("the tool must never surface the plaintext invite token")
	}
	if !strings.Contains(rec.Body.String(), `"email_sent":true`) {
		t.Fatalf("tool result = %s, want email_sent=true", rec.Body.String())
	}

	if len(mailer.sent) != 2 {
		t.Fatalf("sent %d emails, want exactly one per invitation (2)", len(mailer.sent))
	}
	for i, to := range []string{"new@example.com", "other@example.com"} {
		m := mailer.sent[i]
		if m.To != to || !strings.Contains(m.Text, "https://app.example.com/invite/flagon_inv_test") {
			t.Fatalf("email %d = to %q text %q, want the accept link to %s", i, m.To, m.Text, to)
		}
	}
}

// A delivery failure never fails the invitation (it already exists); the
// response reports email_sent=false so the caller can share the link instead.
func TestInviteMember_EmailFailureIsReported(t *testing.T) {
	mailer := &fakeMailer{err: errors.New("provider down")}
	s := newTestServer(t, newFakeStore(nil), WithServiceOptions(service.WithMailer(mailer, "https://app.example.com")))
	rec := s.call(http.MethodPost, "/orgs/acme/invitations", testInternalToken, `{"login":"new@example.com"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("invite-member = %d, want 201 (body: %s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"email_sent":false`) {
		t.Fatalf("body = %s, want email_sent=false", rec.Body.String())
	}
}

// The log mailer is not delivery: it only writes the email to the server log,
// so the invitation reports email_sent=false and the inviter shares the link.
func TestInviteMember_LogMailerIsNotSent(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil), WithServiceOptions(service.WithMailer(mail.Log{}, "https://app.example.com")))
	rec := s.call(http.MethodPost, "/orgs/acme/invitations", testInternalToken, `{"login":"new@example.com"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("invite-member = %d, want 201 (body: %s)", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"email_sent":false`) {
		t.Fatalf("body = %s, want email_sent=false for the log mailer", rec.Body.String())
	}
}
