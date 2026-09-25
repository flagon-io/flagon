// Package service is the single implementation of every user-facing Flagon
// operation. The REST handlers (internal/server) and the tool registry that
// backs the in-product agent and the MCP server (internal/ai) are both thin
// adapters over it, so input validation, slugging, the store call, error
// classification, and side effects such as notifications happen in exactly one
// place and cannot drift between the front doors.
//
// Authorization stays where it has always lived: in the store (Postgres RLS plus
// the role checks in internal/db), acting as the caller. The service never
// widens what a caller can do; it only shapes the request and the response.
package service

import (
	"context"
	"log/slog"
	"strings"

	"github.com/flagon-io/flagon/api/internal/mail"
)

// Actor is the authenticated principal an operation runs as.
type Actor struct {
	UserID string
	Email  string
	// Via is how the request authenticated: ViaSession (the app gateway, acting
	// for a signed-in user), ViaPAT, or ViaOAT. Empty is treated as the strictest
	// case (a session with no SSO assertion), so a front door that forgets to set
	// it fails closed.
	Via string
	// SSOProviderID is, for a gateway session, the SSO provider the user's
	// current session was established through ("" when it wasn't). Only the app
	// can assert it (across the internal-token boundary).
	SSOProviderID string
}

// How a request authenticated (Actor.Via).
const (
	ViaSession = "session"
	ViaPAT     = "pat"
	ViaOAT     = "oat"
)

// IsServicePrincipal reports whether the actor is an org access token's service
// principal rather than a human user.
func (a Actor) IsServicePrincipal() bool { return a.Via == ViaOAT }

// Service implements the user-facing operations over a Store.
type Service struct {
	store Store
	// mailer delivers transactional email (invitations); nil sends nothing.
	mailer mail.Sender
	// appURL is the web app's public base URL, for links in emails.
	appURL string
}

// Option configures optional Service dependencies.
type Option func(*Service)

// WithMailer wires transactional email: the sender and the web app's public base
// URL (e.g. https://app.flagon.io) that links in emails point at. Without it
// operations that would email (invitations) still succeed but send nothing, and
// report that no email was sent.
func WithMailer(sender mail.Sender, appURL string) Option {
	return func(s *Service) {
		s.mailer = sender
		s.appURL = strings.TrimRight(strings.TrimSpace(appURL), "/")
	}
}

// New builds a Service over a store. A nil store is allowed for callers that
// only inspect metadata (spec generation, tool-definition tests); any operation
// invoked on it will panic, exactly as calling a nil store would.
func New(store Store, opts ...Option) *Service {
	s := &Service{store: store}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// notify emits a notification best-effort: a failure never fails the operation
// that triggered it (the change already committed), but it is logged so a broken
// notification path is visible rather than silently swallowed.
func (s *Service) notify(ctx context.Context, userID string, orgID *string, ntype, title, body, link string) {
	if userID == "" {
		return
	}
	if err := s.store.CreateNotification(ctx, userID, orgID, ntype, title, body, link); err != nil {
		slog.WarnContext(ctx, "could not emit notification", "type", ntype, "recipient", userID, "err", err)
	}
}

// Slugify lowercases s and turns runs of non-alphanumeric characters into a
// single hyphen, trimming hyphens from the ends. "Acme Corp." -> "acme-corp".
// It is the one slug rule for orgs, projects, and teams on every surface.
func Slugify(s string) string {
	var b strings.Builder
	pendingHyphen := false
	for _, r := range strings.ToLower(s) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			if pendingHyphen && b.Len() > 0 {
				b.WriteByte('-')
			}
			pendingHyphen = false
			b.WriteRune(r)
		default:
			pendingHyphen = true
		}
	}
	return b.String()
}

// nameAndSlug validates a create payload's display name and derives its slug:
// an explicit slug is normalized, otherwise the name is slugged.
func nameAndSlug(name, slug string) (string, string, error) {
	name = strings.TrimSpace(name)
	s := Slugify(slug)
	if s == "" {
		s = Slugify(name)
	}
	if name == "" || s == "" {
		return "", "", Invalid("name is required and must contain a letter or digit")
	}
	return name, s, nil
}

// renameFields validates the optional name/slug of a partial update. A present
// name must be non-empty after trimming; a present slug must normalize to
// something.
func renameFields(name, slug *string) (*string, *string, error) {
	var outName, outSlug *string
	if name != nil {
		n := strings.TrimSpace(*name)
		if n == "" {
			return nil, nil, Invalid("name cannot be empty")
		}
		outName = &n
	}
	if slug != nil {
		sl := Slugify(*slug)
		if sl == "" {
			return nil, nil, Invalid("slug must contain a letter or digit")
		}
		outSlug = &sl
	}
	return outName, outSlug, nil
}

// orDefault returns the trimmed value, or def when it is empty.
func orDefault(v, def string) string {
	if v = strings.TrimSpace(v); v != "" {
		return v
	}
	return def
}
