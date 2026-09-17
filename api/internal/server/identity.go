package server

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
)

// IdentityStore is the data layer the identity endpoints need. *db.DB satisfies
// it; tests can substitute a fake.
type IdentityStore interface {
	Me(ctx context.Context, userID, email string) (db.User, []db.Org, error)
	CreateOrg(ctx context.Context, userID, email, name, slug string) (db.Org, error)
	ListOrgs(ctx context.Context, userID string) ([]db.Org, error)
}

type ctxKey string

const (
	userIDKey    ctxKey = "flagon.user_id"
	userEmailKey ctxKey = "flagon.user_email"
)

// registerIdentityAPI wires /me, POST /orgs, and GET /orgs. Every operation is
// gated by the internal-token middleware: only the app (which holds the token
// and has already verified the user's session) may call the API on a user's
// behalf, and it forwards the verified user via headers. The store may be nil
// during spec generation, when handlers never run.
func registerIdentityAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := internalAuth(api, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "get-me",
		Method:      http.MethodGet,
		Path:        "/me",
		Summary:     "Current user and their orgs",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, _ *struct{}) (*MeOutput, error) {
		userID, email := identity(ctx)
		user, orgs, err := store.Me(ctx, userID, email)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not load profile", err)
		}
		out := &MeOutput{}
		out.Body.User = user
		out.Body.Orgs = orgs
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "create-org",
		Method:        http.MethodPost,
		Path:          "/orgs",
		Summary:       "Create an organization",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *CreateOrgInput) (*OrgOutput, error) {
		userID, email := identity(ctx)
		name := strings.TrimSpace(in.Body.Name)
		slug := slugify(in.Body.Slug)
		if slug == "" {
			slug = slugify(name)
		}
		if name == "" || slug == "" {
			return nil, huma.Error422UnprocessableEntity("name is required and must contain a letter or digit")
		}
		org, err := store.CreateOrg(ctx, userID, email, name, slug)
		switch {
		case errors.Is(err, db.ErrOrgSlugTaken):
			return nil, huma.Error409Conflict("that org slug is already taken")
		case err != nil:
			return nil, huma.Error500InternalServerError("could not create org", err)
		}
		out := &OrgOutput{}
		out.Body = org
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "list-orgs",
		Method:      http.MethodGet,
		Path:        "/orgs",
		Summary:     "List the caller's orgs",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, _ *struct{}) (*OrgsOutput, error) {
		userID, _ := identity(ctx)
		orgs, err := store.ListOrgs(ctx, userID)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not list orgs", err)
		}
		out := &OrgsOutput{}
		out.Body.Orgs = orgs
		return out, nil
	})
}

// MeOutput is the /me response.
type MeOutput struct {
	Body struct {
		User db.User  `json:"user"`
		Orgs []db.Org `json:"orgs"`
	}
}

// CreateOrgInput is the POST /orgs request.
type CreateOrgInput struct {
	Body struct {
		Name string `json:"name" doc:"Display name" example:"Acme"`
		Slug string `json:"slug,omitempty" doc:"URL slug; derived from the name when omitted" example:"acme"`
	}
}

// OrgOutput is a single-org response.
type OrgOutput struct {
	Body db.Org
}

// OrgsOutput is the list-orgs response.
type OrgsOutput struct {
	Body struct {
		Orgs []db.Org `json:"orgs"`
	}
}

// internalAuth authenticates the app via a shared internal token and forwards
// the verified user identity into the request context. It fails closed: no
// configured token, or a bad/absent one, is rejected.
func internalAuth(api huma.API, token string) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		if token == "" {
			_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable, "identity API is not configured")
			return
		}
		presented := strings.TrimPrefix(ctx.Header("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(presented), []byte(token)) != 1 {
			_ = huma.WriteErr(api, ctx, http.StatusUnauthorized, "invalid internal token")
			return
		}
		userID := strings.TrimSpace(ctx.Header("X-Flagon-User-Id"))
		if userID == "" {
			_ = huma.WriteErr(api, ctx, http.StatusUnauthorized, "missing user identity")
			return
		}
		ctx = huma.WithValue(ctx, userIDKey, userID)
		ctx = huma.WithValue(ctx, userEmailKey, strings.TrimSpace(ctx.Header("X-Flagon-User-Email")))
		next(ctx)
	}
}

func identity(ctx context.Context) (userID, email string) {
	userID, _ = ctx.Value(userIDKey).(string)
	email, _ = ctx.Value(userEmailKey).(string)
	return userID, email
}

// slugify lowercases s and turns runs of non-alphanumeric characters into a
// single hyphen, trimming hyphens from the ends. "Acme Corp." -> "acme-corp".
func slugify(s string) string {
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
