// Package mail is the API's transactional email seam. Operations that must
// reach someone by email (today: org invitations) send through a Sender chosen
// by config, so every front door (REST, the in-product agent, MCP) delivers the
// same email from the one place the operation runs - the service layer.
//
// Two senders ship: Resend (HTTP API) for real delivery, and a log sender that
// writes the text version to the server log so local development needs no
// provider. Adding a provider is a new Sender, not a change to call sites.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// Message is one rendered email.
type Message struct {
	To      string
	Subject string
	HTML    string
	Text    string
}

// Sender delivers a Message.
type Sender interface {
	Send(ctx context.Context, m Message) error
	// Delivers reports whether a successful Send actually reaches the
	// recipient. The log sender returns false: it only writes the message to the
	// server log, so callers must not report the email as sent.
	Delivers() bool
}

// Config selects and configures the Sender.
type Config struct {
	// Provider is auto (or empty), resend, or log. auto uses Resend when an API
	// key is set, otherwise the log sender.
	Provider     string
	ResendAPIKey string
	// From is the sender address, e.g. "Flagon <hello@flagon.io>".
	From string
}

// DefaultFrom is Resend's shared onboarding sender, usable before a domain is
// verified.
const DefaultFrom = "Flagon <onboarding@resend.dev>"

// New builds the Sender for cfg and returns it with a label for logging. A
// provider pinned explicitly without its credentials is an error, so a
// misconfigured deploy fails at boot rather than silently dropping mail.
func New(cfg Config) (Sender, string, error) {
	from := strings.TrimSpace(cfg.From)
	if from == "" {
		from = DefaultFrom
	}
	switch strings.ToLower(strings.TrimSpace(cfg.Provider)) {
	case "resend":
		if strings.TrimSpace(cfg.ResendAPIKey) == "" {
			return nil, "", errors.New("FLAGON_MAIL_PROVIDER=resend requires RESEND_API_KEY")
		}
		return NewResend(cfg.ResendAPIKey, from), "resend", nil
	case "log":
		return Log{}, "log", nil
	case "", "auto":
		if strings.TrimSpace(cfg.ResendAPIKey) != "" {
			return NewResend(cfg.ResendAPIKey, from), "resend", nil
		}
		return Log{}, "log", nil
	default:
		return nil, "", fmt.Errorf("unknown FLAGON_MAIL_PROVIDER %q (want auto, resend, or log)", cfg.Provider)
	}
}

// Log is the development Sender: it writes the text version to the server log
// and never fails. Nothing leaves the machine.
type Log struct{}

// Delivers is false: the log sender never leaves the machine.
func (Log) Delivers() bool { return false }

// Send logs the message.
func (Log) Send(_ context.Context, m Message) error {
	slog.Info("[email] not sent (log mailer)", "to", m.To, "subject", m.Subject, "text", m.Text)
	return nil
}

// resendEndpoint is Resend's send-email API.
const resendEndpoint = "https://api.resend.com/emails"

// Resend sends through the Resend HTTP API.
type Resend struct {
	apiKey   string
	from     string
	endpoint string
	http     *http.Client
}

// NewResend builds a Resend sender.
func NewResend(apiKey, from string) *Resend {
	return &Resend{apiKey: apiKey, from: from, endpoint: resendEndpoint, http: &http.Client{Timeout: 15 * time.Second}}
}

// Delivers is true: Resend hands the message to a real mail provider.
func (r *Resend) Delivers() bool { return true }

// Send posts the message to Resend.
func (r *Resend) Send(ctx context.Context, m Message) error {
	body, err := json.Marshal(map[string]any{
		"from":    r.from,
		"to":      []string{m.To},
		"subject": m.Subject,
		"html":    m.HTML,
		"text":    m.Text,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+r.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.http.Do(req)
	if err != nil {
		return fmt.Errorf("resend: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("resend: send failed (%d): %s", resp.StatusCode, strings.TrimSpace(string(msg)))
	}
	return nil
}
