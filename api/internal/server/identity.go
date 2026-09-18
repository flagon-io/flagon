package server

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/db"
)

// IdentityStore is the data layer the identity endpoints need. *db.DB satisfies
// it; tests can substitute a fake.
type IdentityStore interface {
	Me(ctx context.Context, userID, email string) (db.User, []db.Org, error)
	CreateOrg(ctx context.Context, userID, email, name, slug string) (db.Org, error)
	UpdateOrg(ctx context.Context, actorID, slug, name string) (db.Org, error)
	ListOrgs(ctx context.Context, userID string) ([]db.Org, error)
	UpsertUserProfile(ctx context.Context, userID, email string, p db.ProfileInput) error
	SetUserDeleted(ctx context.Context, userID string, deleted bool) error
	PublicUserProfile(ctx context.Context, username string) (*db.PublicProfile, error)
	LeaveOrg(ctx context.Context, userID, slug string) error

	ListProjects(ctx context.Context, actorID, orgSlug string) ([]db.Project, error)
	CreateProject(ctx context.Context, actorID, orgSlug string, in db.ProjectInput) (db.Project, error)
	GetProject(ctx context.Context, actorID, orgSlug, projectSlug string) (db.Project, error)
	UpdateProject(ctx context.Context, actorID, orgSlug, projectSlug string, in db.ProjectUpdate) (db.Project, error)
	SetProjectDeleted(ctx context.Context, actorID, orgSlug, projectSlug string, deleted bool) (db.Project, error)

	GetOrg(ctx context.Context, actorID, orgSlug string) (db.Org, error)

	GetAuditConfig(ctx context.Context, actorID, orgSlug string) (ipDisclosure bool, err error)
	SetAuditConfig(ctx context.Context, actorID, orgSlug string, ipDisclosure bool) error

	ListMembers(ctx context.Context, actorID, slug string) ([]db.Member, error)
	AddMember(ctx context.Context, actorID, slug, login, role string) (targetID, orgName string, err error)
	SetMemberRole(ctx context.Context, actorID, slug, targetID, newRole string) error
	RemoveMember(ctx context.Context, actorID, slug, targetID string) error

	InviteMember(ctx context.Context, actorID, slug, login, role string) (db.InviteResult, error)
	ListInvitations(ctx context.Context, actorID, slug string) ([]db.Invitation, error)
	RevokeInvitation(ctx context.Context, actorID, slug, id string) error
	InvitationByToken(ctx context.Context, token string) (*db.InviteLookup, error)
	AcceptInvitation(ctx context.Context, userID, email, token string) (slug, name, invitedBy string, err error)

	ListNotifications(ctx context.Context, userID string, limit int) ([]db.Notification, error)
	UnreadNotificationCount(ctx context.Context, userID string) (int, error)
	MarkNotificationRead(ctx context.Context, userID, id string) error
	MarkAllNotificationsRead(ctx context.Context, userID string) error
	CreateNotification(ctx context.Context, userID string, orgID *string, ntype, title, body, link string) error

	CreatePAT(ctx context.Context, userID, name string, scopes []string, expiresAt *time.Time) (string, db.AccessToken, error)
	CreateOAT(ctx context.Context, actorID, slug, name, role string, scopes []string, expiresAt *time.Time) (string, string, error)
	ListPATs(ctx context.Context, userID string) ([]db.AccessToken, error)
	ListOATs(ctx context.Context, actorID, slug string) ([]db.AccessToken, error)
	RevokePAT(ctx context.Context, userID, id string) error
	RevokeOAT(ctx context.Context, actorID, id string) error
	ResolveToken(ctx context.Context, secret string) (db.TokenPrincipal, error)
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
	auth := combinedAuth(api, store, internalToken)

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
		case errors.Is(err, db.ErrOrgLimitReached):
			return nil, huma.NewError(http.StatusPaymentRequired,
				"the free plan includes one organization; add a payment method to create more")
		case err != nil:
			return nil, huma.Error500InternalServerError("could not create org", err)
		}
		// Emit a welcome notification (best-effort; never fail creation over it).
		_ = store.CreateNotification(ctx, userID, &org.ID, "org.created",
			"Welcome to "+org.Name, "Your organization is ready. Invite teammates to get started.", "/"+org.Slug)
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

	huma.Register(api, huma.Operation{
		OperationID: "update-org",
		Method:      http.MethodPatch,
		Path:        "/orgs/{slug}",
		Summary:     "Update an organization's settings",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *UpdateOrgInput) (*OrgOutput, error) {
		userID, _ := identity(ctx)
		name := strings.TrimSpace(in.Body.Name)
		if name == "" {
			return nil, huma.Error422UnprocessableEntity("name is required")
		}
		org, err := store.UpdateOrg(ctx, userID, in.Slug, name)
		switch {
		case errors.Is(err, db.ErrForbidden):
			return nil, huma.Error403Forbidden("you don't have permission to do that")
		case errors.Is(err, db.ErrNotMember):
			return nil, huma.Error404NotFound("organization not found")
		case err != nil:
			return nil, huma.Error500InternalServerError("could not update org", err)
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *LeaveOrgInput) (*LeaveOrgOutput, error) {
		userID, _ := identity(ctx)
		err := store.LeaveOrg(ctx, userID, in.Slug)
		switch {
		case errors.Is(err, db.ErrNotMember):
			return nil, huma.Error404NotFound("you are not a member of that organization")
		case errors.Is(err, db.ErrSoleOwner):
			return nil, huma.Error409Conflict(
				"you're the only owner; transfer ownership or delete the organization first")
		case err != nil:
			return nil, huma.Error500InternalServerError("could not leave org", err)
		}
		out := &LeaveOrgOutput{}
		out.Body.OK = true
		return out, nil
	})

	// Internal: the app mirrors the caller's public profile here whenever it
	// changes (the app/BetterAuth is the writer; this keeps the API's copy fresh).
	huma.Register(api, huma.Operation{
		OperationID: "sync-profile",
		Method:      http.MethodPut,
		Path:        "/me/profile",
		Summary:     "Mirror the caller's public profile (internal)",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *SyncProfileInput) (*SyncProfileOutput, error) {
		userID, email := identity(ctx)
		err := store.UpsertUserProfile(ctx, userID, email, db.ProfileInput{
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
		switch {
		case errors.Is(err, db.ErrUsernameTaken):
			return nil, huma.Error409Conflict("that username is already taken")
		case err != nil:
			return nil, huma.Error500InternalServerError("could not sync profile", err)
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
		Middlewares: huma.Middlewares{internalAuth(api, internalToken)},
	}, func(ctx context.Context, in *SetDeletedInput) (*SyncProfileOutput, error) {
		userID, _ := identity(ctx)
		if err := store.SetUserDeleted(ctx, userID, in.Body.Deleted); err != nil {
			return nil, huma.Error500InternalServerError("could not update account state", err)
		}
		out := &SyncProfileOutput{}
		out.Body.OK = true
		return out, nil
	})

	// Public (no auth): GitHub-style user profile, e.g. GET /users/{username}.
	// Reads through the SECURITY DEFINER window, so only public fields are exposed.
	huma.Register(api, huma.Operation{
		OperationID: "get-user",
		Method:      http.MethodGet,
		Path:        "/users/{username}",
		Summary:     "Public user profile",
	}, func(ctx context.Context, in *GetUserInput) (*PublicUserOutput, error) {
		p, err := store.PublicUserProfile(ctx, in.Username)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not load user", err)
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
		next(ctx)
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
			if err != nil {
				_ = huma.WriteErr(api, ctx, http.StatusUnauthorized, "invalid or expired token")
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
			next(withAuditMeta(ctx))
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
		next(withAuditMeta(ctx))
	}
}

// withAuditMeta records the request's "where" (client IP, country, user-agent)
// onto the context so recordAudit can stamp it onto any audit entry the request
// writes. The app gateway forwards the end user's values as X-Flagon-Client-*;
// a direct API/MCP call falls back to the connection's own proxy headers.
func withAuditMeta(ctx huma.Context) huma.Context {
	country := strings.TrimSpace(ctx.Header("X-Flagon-Client-Country"))
	ua := strings.TrimSpace(ctx.Header("X-Flagon-Client-Ua"))
	if ua == "" {
		ua = strings.TrimSpace(ctx.Header("User-Agent"))
	}
	ctx = huma.WithValue(ctx, audit.CtxIP, clientIP(ctx))
	ctx = huma.WithValue(ctx, audit.CtxCountry, country)
	ctx = huma.WithValue(ctx, audit.CtxUA, ua)
	return ctx
}

// clientIP resolves the caller's IP from the first present proxy header. The
// gateway-forwarded end-user IP wins; then Fly's edge header; then the standard
// forwarded-for chain (first hop is the client).
func clientIP(ctx huma.Context) string {
	for _, h := range []string{"X-Flagon-Client-Ip", "Fly-Client-Ip", "X-Forwarded-For", "X-Real-Ip"} {
		v := strings.TrimSpace(ctx.Header(h))
		if v == "" {
			continue
		}
		if i := strings.IndexByte(v, ','); i >= 0 {
			v = strings.TrimSpace(v[:i])
		}
		return v
	}
	return ""
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
