package server

import (
	"context"
	"crypto/subtle"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// ProfileStore mirrors the app-owned user profile and serves the public view.
type ProfileStore interface {
	UpsertUserProfile(ctx context.Context, userID, email string, p db.ProfileInput) error
	SetUserDeleted(ctx context.Context, userID string, deleted bool) error
	PublicUserProfile(ctx context.Context, username string) (*db.PublicProfile, error)
	SetUserAuthState(ctx context.Context, userID, email string, twoFactor *bool, ssoProviderIDs []string) error
}

// TokenStore manages access tokens and resolves a presented token to its
// principal (the auth middleware's half).
type TokenStore interface {
	CreatePAT(ctx context.Context, userID, name string, scopes []string, expiresAt *time.Time) (string, db.AccessToken, error)
	CreateOAT(ctx context.Context, actorID, slug, name, role string, scopes []string, expiresAt *time.Time) (string, string, error)
	ListPATs(ctx context.Context, userID string) ([]db.AccessToken, error)
	ListOATs(ctx context.Context, actorID, slug string) ([]db.AccessToken, error)
	RevokePAT(ctx context.Context, userID, id string) error
	RevokeOAT(ctx context.Context, actorID, id string) error
	ResolveToken(ctx context.Context, secret string) (db.TokenPrincipal, error)
}

// SSOStore covers the app-only SSO paths: provisioning SSO-authenticated users
// into their org, and the auth layer's full-configuration read + one-time import
// of providers that predate API ownership (internal).
type SSOStore interface {
	ProvisionSSOMember(ctx context.Context, orgID, userID, email, role string) error
	RecordSSOSignIn(ctx context.Context, userID, email, providerID string) error
	SSOProviderConfigs(ctx context.Context, f db.SSOConfigFilter) ([]db.SSOProviderConfig, error)
	ImportSSOProvider(ctx context.Context, orgID, createdBy string, in db.SSOProviderInput) (string, error)
}

// IdentityStore is the whole data layer the HTTP API needs: the per-resource
// stores the shared service runs over, plus the transport-only concerns (profile
// mirroring, tokens, SSO provisioning) that have no agent/MCP surface. *db.DB
// satisfies it; tests substitute a fake.
type IdentityStore interface {
	service.Store
	ProfileStore
	TokenStore
	SSOStore
}

var _ IdentityStore = (*db.DB)(nil)

// deps is what every register*API function needs: the shared service (the one
// implementation of each operation), the raw store for transport-only concerns,
// and the two auth middlewares.
type deps struct {
	svc   *service.Service
	store IdentityStore
	// auth accepts a Flagon access token (scope-checked) or the internal token.
	auth func(huma.Context, func(huma.Context))
	// internal accepts ONLY the internal app<->API token (never a user token).
	internal func(huma.Context, func(huma.Context))
}

type ctxKey string

const (
	userIDKey    ctxKey = "flagon.user_id"
	userEmailKey ctxKey = "flagon.user_email"
	// authViaKey records how the request authenticated (service.ViaSession,
	// ViaPAT or ViaOAT); ssoProviderKey the SSO provider the app asserts the
	// current session was established through. Both feed the org policy check.
	authViaKey     ctxKey = "flagon.auth_via"
	ssoProviderKey ctxKey = "flagon.sso_provider"
)

// registerIdentityAPI wires /me, the org endpoints, the profile mirror, and the
// public profile. Operations are gated by combinedAuth (a user token or the
// app's internal token + forwarded user); the mirror endpoints are internal-only
// and the public profile needs no auth. The store may be nil during spec
// generation, when handlers never run.
func registerIdentityAPI(api huma.API, d deps) {
	huma.Register(api, huma.Operation{
		OperationID: "get-me",
		Method:      http.MethodGet,
		Path:        "/me",
		Summary:     "Current user and their orgs",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, _ *struct{}) (*MeOutput, error) {
		user, orgs, err := d.svc.Me(ctx, actor(ctx))
		if err != nil {
			return nil, apiErr(err, "could not load profile")
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
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *CreateOrgInput) (*OrgOutput, error) {
		org, err := d.svc.CreateOrg(ctx, actor(ctx), in.Body.Name, in.Body.Slug)
		if err != nil {
			return nil, apiErr(err, "could not create org")
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
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, _ *struct{}) (*OrgsOutput, error) {
		orgs, err := d.svc.ListOrgs(ctx, actor(ctx))
		if err != nil {
			return nil, apiErr(err, "could not list orgs")
		}
		out := &OrgsOutput{}
		out.Body.Orgs = orgs
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "update-org",
		Method:      http.MethodPatch,
		Path:        "/orgs/{slug}",
		Summary:     "Update an organization's settings",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *UpdateOrgInput) (*OrgOutput, error) {
		org, err := d.svc.UpdateOrg(ctx, actor(ctx), in.Slug, in.Body.Name)
		if err != nil {
			return nil, apiErr(err, "could not update org")
		}
		out := &OrgOutput{}
		out.Body = org
		return out, nil
	})

	// Leave an org (removes the caller's membership). The sole owner can't leave.
	huma.Register(api, huma.Operation{
		OperationID: "leave-org",
		Method:      http.MethodPost,
		Path:        "/orgs/{slug}/leave",
		Summary:     "Leave an organization",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *LeaveOrgInput) (*LeaveOrgOutput, error) {
		if err := d.svc.LeaveOrg(ctx, actor(ctx), in.Slug); err != nil {
			return nil, apiErr(err, "could not leave org")
		}
		out := &LeaveOrgOutput{}
		out.Body.OK = true
		return out, nil
	})

	// Soft delete, the recently deleted archive, and restore (org_delete.go).
	registerOrgDeleteAPI(api, d)

	// Internal-only: the app mirrors the caller's public profile here whenever
	// it changes. The profile (username included) and the auth-state fields (2FA,
	// linked SSO identities, which feed the org security policy) are owned by the
	// app's auth layer, so only the app gateway may write the mirror; no access
	// token reaches it, whatever its scopes.
	huma.Register(api, huma.Operation{
		OperationID: "sync-profile",
		Method:      http.MethodPut,
		Path:        "/me/profile",
		Summary:     "Mirror the caller's public profile (internal)",
		Middlewares: huma.Middlewares{d.internal},
	}, func(ctx context.Context, in *SyncProfileInput) (*SyncProfileOutput, error) {
		userID, email := identity(ctx)
		authState := in.Body.TwoFactorEnabled != nil || in.Body.SSOProviderIDs != nil
		err := d.store.UpsertUserProfile(ctx, userID, email, db.ProfileInput{
			Username:    strings.TrimSpace(in.Body.Username),
			Name:        in.Body.Name,
			Bio:         in.Body.Bio,
			Pronouns:    in.Body.Pronouns,
			WebsiteURL:  in.Body.WebsiteURL,
			Company:     in.Body.Company,
			Location:    in.Body.Location,
			SocialLinks: in.Body.SocialLinks,
			PublicEmail: in.Body.PublicEmail,
			AvatarURL:   in.Body.AvatarURL,
		})
		if err != nil {
			return nil, apiErr(err, "could not sync profile")
		}
		if authState {
			var ids []string
			if in.Body.SSOProviderIDs != nil {
				ids = *in.Body.SSOProviderIDs
				if ids == nil {
					ids = []string{}
				}
			}
			if err := d.store.SetUserAuthState(ctx, userID, email, in.Body.TwoFactorEnabled, ids); err != nil {
				return nil, apiErr(err, "could not sync profile")
			}
		}
		out := &SyncProfileOutput{}
		out.Body.OK = true
		return out, nil
	})

	// Internal-only: the app mirrors an account's soft-delete state here so the
	// public profile read can hide deleted users. Never token-reachable.
	huma.Register(api, huma.Operation{
		OperationID: "set-account-deleted",
		Method:      http.MethodPut,
		Path:        "/me/deleted",
		Summary:     "Mirror the account's soft-delete state (internal)",
		Middlewares: huma.Middlewares{d.internal},
	}, func(ctx context.Context, in *SetDeletedInput) (*SyncProfileOutput, error) {
		userID, _ := identity(ctx)
		if err := d.store.SetUserDeleted(ctx, userID, in.Body.Deleted); err != nil {
			return nil, apiErr(err, "could not update account state")
		}
		out := &SyncProfileOutput{}
		out.Body.OK = true
		return out, nil
	})

	// Public (no auth): a user's public profile, e.g. GET /users/{username}.
	// Reads through the SECURITY DEFINER window, so only public fields are exposed.
	huma.Register(api, huma.Operation{
		OperationID: "get-user",
		Method:      http.MethodGet,
		Path:        "/users/{username}",
		Summary:     "Public user profile",
	}, func(ctx context.Context, in *GetUserInput) (*PublicUserOutput, error) {
		p, err := d.store.PublicUserProfile(ctx, in.Username)
		if err != nil {
			return nil, apiErr(err, "could not load user")
		}
		if p == nil {
			return nil, huma.Error404NotFound("user not found")
		}
		out := &PublicUserOutput{}
		out.Body = *p
		return out, nil
	})
}

// SyncProfileInput is the internal profile-mirror request. Every field is
// optional (a partial mirror just clears what it omits).
type SyncProfileInput struct {
	Body struct {
		Username    string   `json:"username,omitempty"`
		Name        string   `json:"name,omitempty"`
		Bio         string   `json:"bio,omitempty"`
		Pronouns    string   `json:"pronouns,omitempty"`
		WebsiteURL  string   `json:"websiteUrl,omitempty"`
		Company     string   `json:"company,omitempty"`
		Location    string   `json:"location,omitempty"`
		SocialLinks []string `json:"socialLinks,omitempty"`
		PublicEmail string   `json:"publicEmail,omitempty"`
		AvatarURL   string   `json:"avatarUrl,omitempty"`
		// Auth-state mirror. Omitted = unchanged.
		TwoFactorEnabled *bool     `json:"twoFactorEnabled,omitempty" doc:"Whether the account has two-factor authentication enabled (mirrored by the app)."`
		SSOProviderIDs   *[]string `json:"ssoProviderIds,omitempty" doc:"Every SSO provider id the account has a linked identity with; replaces the mirrored set (mirrored by the app)."`
	}
}

// SyncProfileOutput acknowledges a profile mirror.
type SyncProfileOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

// LeaveOrgInput identifies the org to leave.
type LeaveOrgInput struct {
	Slug string `path:"slug" doc:"The organization slug" example:"acme"`
}

// LeaveOrgOutput acknowledges leaving an org.
type LeaveOrgOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

// GetUserInput is the public-profile lookup by username.
type GetUserInput struct {
	Username string `path:"username" doc:"The user's username" example:"syntaqx"`
}

// PublicUserOutput is the public user profile response.
type PublicUserOutput struct {
	Body db.PublicProfile
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

// SetDeletedInput mirrors the account's soft-delete state (internal).
type SetDeletedInput struct {
	Body struct {
		Deleted bool `json:"deleted"`
	}
}

// UpdateOrgInput is the PATCH /orgs/{slug} request.
type UpdateOrgInput struct {
	Slug string `path:"slug"`
	Body struct {
		Name string `json:"name" doc:"Display name" example:"Acme"`
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
		ctx = withGatewaySession(ctx)
		next(withAuditMeta(ctx, true))
	}
}

// combinedAuth accepts EITHER a Flagon access token (PAT/OAT bearer, resolved to
// its principal) OR the internal app<->API token + forwarded-user headers. Both
// bind the same acting-user context, so every handler acts as the principal with
// its RLS + role permissions - a token can do exactly what its principal can.
// Fails closed. Access tokens are recognized by the "flagon_" prefix.
func combinedAuth(api huma.API, store IdentityStore, internalToken string) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		presented := strings.TrimPrefix(ctx.Header("Authorization"), "Bearer ")

		if strings.HasPrefix(presented, "flagon_") {
			if store == nil {
				_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable, "not configured")
				return
			}
			principal, err := store.ResolveToken(ctx.Context(), presented)
			if errors.Is(err, db.ErrInvalidToken) {
				_ = huma.WriteErr(api, ctx, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			if err != nil {
				// Not a verdict on the token (e.g. the database is down): a 401
				// would tell a valid caller to throw its credential away. Log the
				// cause with the request id; the client gets a redacted 503.
				op := ""
				if o := ctx.Operation(); o != nil {
					op = o.OperationID
				}
				slog.ErrorContext(ctx.Context(), "could not resolve access token",
					"request_id", RequestID(ctx.Context()), "operation", op, "err", err)
				_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable,
					"authentication is temporarily unavailable; try again shortly")
				return
			}
			// Scoped tokens (non-nil scopes) can reach only operations whose scope
			// they hold; a nil scope list means "full access" (role-limited only).
			if principal.Scopes != nil && !scopeAllows(principal.Scopes, ctx.Operation().OperationID) {
				_ = huma.WriteErr(api, ctx, http.StatusForbidden,
					"this token is missing the scope required for this operation")
				return
			}
			ctx = huma.WithValue(ctx, userIDKey, principal.UserID)
			ctx = huma.WithValue(ctx, userEmailKey, principal.Email)
			ctx = huma.WithValue(ctx, authViaKey, tokenVia(principal.Kind))
			next(withAuditMeta(ctx, false))
			return
		}

		if internalToken == "" {
			_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable, "identity API is not configured")
			return
		}
		if subtle.ConstantTimeCompare([]byte(presented), []byte(internalToken)) != 1 {
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
		ctx = withGatewaySession(ctx)
		next(withAuditMeta(ctx, true))
	}
}

// withAuditMeta records the request's "where" (client IP, country, user-agent)
// onto the context so recordAudit can stamp it onto any audit entry the request
// writes - including entries written by tools the request runs (the in-product
// agent's confirmed actions), since the same context flows into them.
//
// gateway must be true ONLY for requests authenticated with the internal token:
// the app gateway is the one caller trusted to forward the END user's values as
// X-Flagon-Client-*. For everyone else (access tokens) those headers are ignored
// and the connection's own address is used (see withConnIP, which honors a proxy
// header only when one is explicitly configured), so a token holder cannot
// forge the IP or location their audit entries record.
func withAuditMeta(ctx huma.Context, gateway bool) huma.Context {
	ip, country, ua := "", "", ""
	if gateway {
		ip = firstHop(ctx.Header("X-Flagon-Client-Ip"))
		country = strings.TrimSpace(ctx.Header("X-Flagon-Client-Country"))
		ua = strings.TrimSpace(ctx.Header("X-Flagon-Client-Ua"))
	}
	if ip == "" {
		ip = requestConnIP(ctx)
	}
	if ua == "" {
		ua = strings.TrimSpace(ctx.Header("User-Agent"))
	}
	ctx = huma.WithValue(ctx, audit.CtxIP, ip)
	ctx = huma.WithValue(ctx, audit.CtxCountry, country)
	ctx = huma.WithValue(ctx, audit.CtxUA, ua)
	return ctx
}

// requestConnIP is the caller's network address as resolved by withConnIP, with
// the raw peer address as a fallback.
func requestConnIP(ctx huma.Context) string {
	if ip := connIP(ctx.Context()); ip != "" {
		return ip
	}
	return peerIP(ctx.RemoteAddr())
}

func identity(ctx context.Context) (userID, email string) {
	userID, _ = ctx.Value(userIDKey).(string)
	email, _ = ctx.Value(userEmailKey).(string)
	return userID, email
}

// actor is the service principal for the request's authenticated user.
func actor(ctx context.Context) service.Actor {
	userID, email := identity(ctx)
	via, _ := ctx.Value(authViaKey).(string)
	sso, _ := ctx.Value(ssoProviderKey).(string)
	return service.Actor{UserID: userID, Email: email, Via: via, SSOProviderID: sso}
}

// SSOProviderHeader is how the app asserts, per request, which SSO provider the
// signed-in user's CURRENT session was established through (absent or empty when
// it wasn't an SSO sign-in). It is trusted only alongside the internal token.
const SSOProviderHeader = "X-Flagon-Auth-Sso-Provider"

// withGatewaySession marks an internal-token request as a gateway session and
// binds the app's SSO assertion for it. Only the internal-token paths call it,
// so a token caller can never claim an SSO session by sending the header.
func withGatewaySession(ctx huma.Context) huma.Context {
	ctx = huma.WithValue(ctx, authViaKey, service.ViaSession)
	return huma.WithValue(ctx, ssoProviderKey, strings.TrimSpace(ctx.Header(SSOProviderHeader)))
}

// tokenVia maps a resolved token's kind to Actor.Via. Anything that is not
// recognizably an org token is treated as a personal one (never exempt).
func tokenVia(kind string) string {
	if kind == "oat" {
		return service.ViaOAT
	}
	return service.ViaPAT
}
