package server

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// registerTokensAPI wires access-token management. These use internalAuth ONLY
// (the app, acting as the user) - a token can never manage tokens, so it can't
// escalate its own privileges. PATs live under /me, OATs under the org.
func registerTokensAPI(api huma.API, d deps) {
	auth, store := d.internal, d.store

	// --- Personal access tokens ---
	huma.Register(api, huma.Operation{
		OperationID:   "create-pat",
		Method:        http.MethodPost,
		Path:          "/me/tokens",
		Summary:       "Create a personal access token",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *CreatePATInput) (*CreateTokenOutput, error) {
		userID, _ := identity(ctx)
		name := strings.TrimSpace(in.Body.Name)
		if name == "" {
			return nil, huma.Error422UnprocessableEntity("a name is required")
		}
		scopes, err := cleanScopes(in.Body.Scopes, in.Body.Full)
		if err != nil {
			return nil, err
		}
		expiry, err := pickExpiry(in.Body.ExpiresAt, in.Body.ExpiresInDays)
		if err != nil {
			return nil, err
		}
		secret, tok, err := store.CreatePAT(ctx, userID, name, scopes, expiry)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not create token", err)
		}
		return tokenCreated(secret, tok.ID, tok.Prefix), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "list-pats",
		Method:      http.MethodGet,
		Path:        "/me/tokens",
		Summary:     "List your personal access tokens",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, _ *struct{}) (*TokensOutput, error) {
		userID, _ := identity(ctx)
		toks, err := store.ListPATs(ctx, userID)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not list tokens", err)
		}
		out := &TokensOutput{}
		out.Body.Tokens = toks
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "revoke-pat",
		Method:      http.MethodDelete,
		Path:        "/me/tokens/{id}",
		Summary:     "Revoke a personal access token",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *TokenIDInput) (*OKOutput, error) {
		userID, _ := identity(ctx)
		if err := store.RevokePAT(ctx, userID, in.ID); err != nil {
			return nil, huma.Error500InternalServerError("could not revoke token", err)
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	// --- Organization access tokens ---
	huma.Register(api, huma.Operation{
		OperationID:   "create-oat",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/tokens",
		Summary:       "Create an organization access token",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *CreateOATInput) (*CreateTokenOutput, error) {
		actorID, _ := identity(ctx)
		name := strings.TrimSpace(in.Body.Name)
		if name == "" {
			return nil, huma.Error422UnprocessableEntity("a name is required")
		}
		role := in.Body.Role
		if role == "" {
			role = db.RoleMember
		}
		scopes, err := cleanScopes(in.Body.Scopes, in.Body.Full)
		if err != nil {
			return nil, err
		}
		expiry, err := pickExpiry(in.Body.ExpiresAt, in.Body.ExpiresInDays)
		if err != nil {
			return nil, err
		}
		secret, id, err := store.CreateOAT(ctx, actorID, in.Slug, name, role, scopes, expiry)
		if err != nil {
			return nil, apiErr(err, "could not create token")
		}
		return tokenCreated(secret, id, ""), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "list-oats",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/tokens",
		Summary:     "List an organization's access tokens",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *OrgTokensInput) (*TokensOutput, error) {
		actorID, _ := identity(ctx)
		toks, err := store.ListOATs(ctx, actorID, in.Slug)
		if err != nil {
			return nil, apiErr(err, "could not list tokens")
		}
		out := &TokensOutput{}
		out.Body.Tokens = toks
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "revoke-oat",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/tokens/{id}",
		Summary:     "Revoke an organization access token",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *OrgTokenIDInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RevokeOAT(ctx, actorID, in.ID); err != nil {
			return nil, apiErr(err, "could not revoke token",
				service.Override{Err: db.ErrNotMember, Status: http.StatusNotFound, Message: "token not found"})
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})
}

func expiryFrom(days int) *time.Time {
	if days <= 0 {
		return nil
	}
	t := time.Now().AddDate(0, 0, days)
	return &t
}

// pickExpiry resolves the token's expiry. An absolute date (custom expiration)
// wins over the day preset; it must be in the future. A nil date with days <= 0
// means no expiry.
func pickExpiry(at *time.Time, days int) (*time.Time, error) {
	if at == nil {
		return expiryFrom(days), nil
	}
	if !at.After(time.Now()) {
		return nil, huma.Error422UnprocessableEntity("expiration must be in the future")
	}
	t := *at
	return &t, nil
}

func tokenCreated(secret, id, prefix string) *CreateTokenOutput {
	out := &CreateTokenOutput{}
	out.Body.Token = secret
	out.Body.ID = id
	out.Body.Prefix = prefix
	return out
}

// CreatePATInput creates a personal access token.
type CreatePATInput struct {
	Body struct {
		Name          string     `json:"name"`
		Scopes        []Scope    `json:"scopes,omitempty" doc:"Scopes to grant (classic-style). Omit and set full=true for full access."`
		Full          bool       `json:"full,omitempty" doc:"Full access (no scope restriction)"`
		ExpiresInDays int        `json:"expires_in_days,omitempty" doc:"0 = no expiry"`
		ExpiresAt     *time.Time `json:"expires_at,omitempty" doc:"Absolute expiry (RFC3339). Takes precedence over expires_in_days."`
	}
}

// CreateOATInput creates an org access token.
type CreateOATInput struct {
	Slug string `path:"slug"`
	Body struct {
		Name          string     `json:"name"`
		Role          string     `json:"role,omitempty" enum:"admin,member,viewer" doc:"Role the token acts with (default member)"`
		Scopes        []Scope    `json:"scopes,omitempty"`
		Full          bool       `json:"full,omitempty" doc:"Full access (no scope restriction)"`
		ExpiresInDays int        `json:"expires_in_days,omitempty" doc:"0 = no expiry"`
		ExpiresAt     *time.Time `json:"expires_at,omitempty" doc:"Absolute expiry (RFC3339). Takes precedence over expires_in_days."`
	}
}

// Schema publishes the token scope vocabulary in the OpenAPI spec as one named
// enum ("Scope"), generated from AllScopes. Clients derive their scope type from
// it (the app's token checklist is typed against it), so a scope added here can
// never be silently missing from a client: it is one list, not a hand copy.
func (Scope) Schema(r huma.Registry) *huma.Schema {
	const name = "Scope"
	if _, ok := r.Map()[name]; !ok {
		enum := make([]any, len(AllScopes))
		for i, s := range AllScopes {
			enum[i] = string(s)
		}
		r.Map()[name] = &huma.Schema{
			Type:        huma.TypeString,
			Enum:        enum,
			Description: "A classic-style token scope. A parent scope implies its children (admin:x > write:x > read:x).",
		}
	}
	return &huma.Schema{Ref: "#/components/schemas/" + name}
}

// cleanScopes validates a requested scope set. full=true means unrestricted
// (nil). Otherwise at least one known scope is required (deduped).
func cleanScopes(requested []Scope, full bool) ([]string, error) {
	scopes := make([]string, len(requested))
	for i, s := range requested {
		scopes[i] = string(s)
	}
	if full {
		return nil, nil
	}
	if len(scopes) == 0 {
		return nil, huma.Error422UnprocessableEntity("select at least one scope, or choose full access")
	}
	out := make([]string, 0, len(scopes))
	seen := map[string]bool{}
	for _, s := range scopes {
		if !validScope(s) {
			return nil, huma.Error422UnprocessableEntity("unknown scope: " + s)
		}
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out, nil
}

// CreateTokenOutput carries the show-once secret.
type CreateTokenOutput struct {
	Body struct {
		Token  string `json:"token"`
		ID     string `json:"id"`
		Prefix string `json:"prefix"`
	}
}

// TokensOutput lists tokens (never includes secrets).
type TokensOutput struct {
	Body struct {
		Tokens []db.AccessToken `json:"tokens"`
	}
}

// TokenIDInput identifies a personal token.
type TokenIDInput struct {
	ID string `path:"id"`
}

// OrgTokensInput lists an org's tokens.
type OrgTokensInput struct {
	Slug string `path:"slug"`
}

// OrgTokenIDInput identifies an org token.
type OrgTokenIDInput struct {
	Slug string `path:"slug"`
	ID   string `path:"id"`
}
