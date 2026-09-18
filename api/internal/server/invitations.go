package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
)

// registerInvitationsAPI wires org invitations: inviting people (existing users
// are added directly, unknown emails get a pending invite), listing and revoking
// pending invites, and the pre-auth token lookup + acceptance the invite link
// uses. Management ops are gated by combinedAuth + role; the token lookup is
// public (the token is the secret) and acceptance is internal-only (the app
// triggers it right after the invitee registers).
func registerInvitationsAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "list-invitations",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/invitations",
		Summary:     "List an organization's pending invitations",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *InvitationsInput) (*InvitationsOutput, error) {
		actorID, _ := identity(ctx)
		invites, err := store.ListInvitations(ctx, actorID, in.Slug)
		if err != nil {
			return nil, inviteErr(err, "could not list invitations")
		}
		out := &InvitationsOutput{}
		out.Body.Invitations = invites
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "invite-member",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/invitations",
		Summary:       "Invite someone to an organization by email or username",
		Description:   "Adds an existing Flagon user directly, or creates a pending invitation for an email that has no account yet. The response says which happened; for an invitation it returns a single-use token for the invite link.",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *InviteMemberInput) (*InviteMemberOutput, error) {
		actorID, _ := identity(ctx)
		role := in.Body.Role
		if role == "" {
			role = db.RoleMember
		}
		res, err := store.InviteMember(ctx, actorID, in.Slug, strings.TrimSpace(in.Body.Login), role)
		if err != nil {
			return nil, inviteErr(err, "could not invite member")
		}
		out := &InviteMemberOutput{}
		out.Body.Status = res.Status
		if res.Status == "added" {
			out.Body.UserID = res.UserID
			// Welcome the new member (best-effort), same as add-member.
			_ = store.CreateNotification(ctx, res.UserID, nil, "org.member_added",
				"You were added to "+res.OrgName, "You now have access to "+res.OrgName+".", "/"+in.Slug)
		} else {
			out.Body.Email = res.Email
			out.Body.Token = res.Token
			out.Body.Invitation = &res.Invite
			out.Body.OrgName = res.OrgName
		}
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "revoke-invitation",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/invitations/{id}",
		Summary:     "Revoke a pending invitation",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *RevokeInvitationInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RevokeInvitation(ctx, actorID, in.Slug, in.ID); err != nil {
			return nil, inviteErr(err, "could not revoke invitation")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	// Public (no auth): look up an invitation by its token for the landing page.
	// The token is the secret; this exposes only the org name, invited email, and
	// inviter's display name so the invitee can decide to accept.
	huma.Register(api, huma.Operation{
		OperationID: "get-invitation",
		Method:      http.MethodGet,
		Path:        "/invitations/{token}",
		Summary:     "Look up an invitation by token",
	}, func(ctx context.Context, in *GetInvitationInput) (*InviteLookupOutput, error) {
		l, err := store.InvitationByToken(ctx, in.Token)
		if err != nil {
			return nil, huma.Error500InternalServerError("could not load invitation", err)
		}
		if l == nil {
			return nil, huma.Error404NotFound("invitation not found")
		}
		out := &InviteLookupOutput{}
		out.Body = *l
		return out, nil
	})

	// Internal-only: the app triggers this right after the invitee registers (or
	// while signed in), forwarding their verified identity. Never token-reachable.
	huma.Register(api, huma.Operation{
		OperationID: "accept-invitation",
		Method:      http.MethodPost,
		Path:        "/invitations/{token}/accept",
		Summary:     "Accept an invitation (internal)",
		Middlewares: huma.Middlewares{internalAuth(api, internalToken)},
	}, func(ctx context.Context, in *AcceptInvitationInput) (*AcceptInvitationOutput, error) {
		userID, email := identity(ctx)
		slug, name, invitedBy, err := store.AcceptInvitation(ctx, userID, email, in.Token)
		if err != nil {
			return nil, inviteErr(err, "could not accept invitation")
		}
		// Let the inviter know their invitation was accepted (best-effort).
		if invitedBy != "" {
			_ = store.CreateNotification(ctx, invitedBy, nil, "org.invite_accepted",
				email+" joined "+name, email+" accepted your invitation to "+name+".", "/"+slug)
		}
		out := &AcceptInvitationOutput{}
		out.Body.OrgSlug = slug
		out.Body.OrgName = name
		return out, nil
	})
}

// inviteErr maps the invitation store errors to HTTP statuses.
func inviteErr(err error, fallback string) error {
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	case errors.Is(err, db.ErrUserNotFound):
		return huma.Error422UnprocessableEntity("enter an email address to invite, or the username of an existing user")
	case errors.Is(err, db.ErrAlreadyMember):
		return huma.Error409Conflict("that user is already a member")
	case errors.Is(err, db.ErrInviteExists):
		return huma.Error409Conflict("a pending invitation already exists for that email")
	case errors.Is(err, db.ErrInvalidRole):
		return huma.Error422UnprocessableEntity("invalid role")
	case errors.Is(err, db.ErrInviteNotFound):
		return huma.Error404NotFound("invitation not found")
	case errors.Is(err, db.ErrInviteNotPending):
		return huma.Error409Conflict("this invitation is no longer valid")
	case errors.Is(err, db.ErrInviteExpired):
		return huma.Error410Gone("this invitation has expired")
	case errors.Is(err, db.ErrInviteEmailMismatch):
		return huma.Error403Forbidden("this invitation was sent to a different email address")
	default:
		return huma.Error500InternalServerError(fallback, err)
	}
}

// InvitationsInput lists an org's pending invitations.
type InvitationsInput struct {
	Slug string `path:"slug"`
}

// InvitationsOutput is the pending-invitations list.
type InvitationsOutput struct {
	Body struct {
		Invitations []db.Invitation `json:"invitations"`
	}
}

// InviteMemberInput invites by email or username.
type InviteMemberInput struct {
	Slug string `path:"slug"`
	Body struct {
		Login string `json:"login" doc:"Email address to invite, or the email/username of an existing user"`
		Role  string `json:"role,omitempty" enum:"admin,member,viewer" doc:"Role to grant (default member)"`
	}
}

// InviteMemberOutput reports whether an existing user was added or a pending
// invitation was created. Token is present only for a fresh invitation.
type InviteMemberOutput struct {
	Body struct {
		Status     string         `json:"status" doc:"\"added\" or \"invited\""`
		UserID     string         `json:"user_id,omitempty"`
		Email      string         `json:"email,omitempty"`
		OrgName    string         `json:"org_name,omitempty"`
		Token      string         `json:"token,omitempty" doc:"Single-use invite token for the link (invited only)"`
		Invitation *db.Invitation `json:"invitation,omitempty"`
	}
}

// RevokeInvitationInput revokes a pending invitation.
type RevokeInvitationInput struct {
	Slug string `path:"slug"`
	ID   string `path:"id"`
}

// GetInvitationInput looks up an invitation by its raw token.
type GetInvitationInput struct {
	Token string `path:"token"`
}

// InviteLookupOutput is the public invitation view for the landing page.
type InviteLookupOutput struct {
	Body db.InviteLookup
}

// AcceptInvitationInput accepts an invitation as the forwarded user.
type AcceptInvitationInput struct {
	Token string `path:"token"`
}

// AcceptInvitationOutput returns where the accepter landed.
type AcceptInvitationOutput struct {
	Body struct {
		OrgSlug string `json:"org_slug"`
		OrgName string `json:"org_name"`
	}
}
