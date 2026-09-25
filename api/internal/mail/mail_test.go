package mail

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNewSelectsSender(t *testing.T) {
	cases := []struct {
		cfg     Config
		label   string
		wantErr bool
	}{
		{Config{}, "log", false},
		{Config{ResendAPIKey: "re_x"}, "resend", false},
		{Config{Provider: "log", ResendAPIKey: "re_x"}, "log", false},
		{Config{Provider: "resend", ResendAPIKey: "re_x"}, "resend", false},
		{Config{Provider: "resend"}, "", true},
		{Config{Provider: "smtp"}, "", true},
	}
	for _, tc := range cases {
		s, label, err := New(tc.cfg)
		if tc.wantErr {
			if err == nil {
				t.Errorf("%+v: want error, got %q", tc.cfg, label)
			}
			continue
		}
		if err != nil || s == nil || label != tc.label {
			t.Errorf("%+v: got (%v, %q, %v), want label %q", tc.cfg, s, label, err, tc.label)
		}
	}
}

func TestInviteEmailEscapesAndCarriesLink(t *testing.T) {
	m := InviteEmail("new@example.com", Invite{
		URL: "https://app.flagon.io/invite/flagon_inv_abc", OrgName: "<Acme>", Inviter: "Ada", Role: "admin",
	})
	if m.To != "new@example.com" || m.Subject != "Join <Acme> on Flagon" {
		t.Fatalf("to/subject = %q / %q", m.To, m.Subject)
	}
	if strings.Contains(m.HTML, "<Acme>") || !strings.Contains(m.HTML, "&lt;Acme&gt;") {
		t.Fatal("org name must be HTML-escaped")
	}
	for _, part := range []string{m.HTML, m.Text} {
		if !strings.Contains(part, "https://app.flagon.io/invite/flagon_inv_abc") {
			t.Fatal("both parts must carry the accept link")
		}
	}
	if !strings.Contains(m.Text, "Ada invited you to join <Acme> on Flagon as an admin.") {
		t.Fatalf("text = %q", m.Text)
	}
}

func TestResendPostsMessage(t *testing.T) {
	var got map[string]any
	var auth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	r := NewResend("re_key", "Flagon <hi@example.com>")
	r.endpoint = srv.URL
	if err := r.Send(context.Background(), Message{To: "a@example.com", Subject: "S", HTML: "<p>h</p>", Text: "t"}); err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer re_key" || got["subject"] != "S" || got["from"] != "Flagon <hi@example.com>" {
		t.Fatalf("auth=%q body=%v", auth, got)
	}

	fail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	defer fail.Close()
	r.endpoint = fail.URL
	if err := r.Send(context.Background(), Message{To: "a@example.com"}); err == nil {
		t.Fatal("a non-2xx response must be an error")
	}
}
