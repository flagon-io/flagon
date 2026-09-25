package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// registerInvitationsAPI wires org invitations: inviting people (existing users
// are added directly, unknown emails get a pending invite), listing and revoking
// pending invites, and the pre-auth token lookup + acceptance the invite link
// uses. Management ops are gated by combinedAuth + role; the token lookup is
// public (the token is the secret) and acceptance is internal-only (the app
// triggers it right after the invitee registers).
func registerInvitationsAPI(api huma.API, d deps) {
	// list-invitations is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listInvitations := func(ctx context.Context, slug string, q paginate.Query) (*InvitationsOutput, error) {
		invites, next, err := d.svc.ListInvitations(ctx, actor(ctx), slug, q)
		if err != nil {
			return nil, apiErr(err, "could not list invitations")
		}
		out := &InvitationsOutput{}
		out.Body.Invitations = invites
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/invitations", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-invitations",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/invitations",
		Summary:     "List an organization's pending invitations",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *InvitationsInput) (*InvitationsOutput, error) {
		return listInvitations(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-invitations", "/orgs/{slug}/invitations",
		"List an organization's pending invitations (QUERY)",
		func(ctx context.Context, in *InvitationsQueryInput) (*InvitationsOutput, error) {
			return listInvitations(ctx, in.Slug, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "invite-member",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/invitations",
		Summary:       "Invite someone to an organization by email or username",
		Description:   "Adds an existing Flagon user directly, or creates a pending invitation for an email that has no account yet. The response says which happened; for an invitation it emails the invitee the accept link (reported in email_sent) and also returns the single-use token for the invite link.",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *InviteMemberInput) (*InviteMemberOutput, error) {
		res, err := d.svc.InviteMember(ctx, actor(ctx), in.Slug, in.Body.Login, in.Body.Role)
		if err != nil {
			return nil, apiErr(err, "could not invite member")
		}
		out := &InviteMemberOutput{}
		out.Body.Status = res.Status
		if res.Status == "added" {
			out.Body.UserID = res.UserID
		} else {
			out.Body.Email = res.Email
			out.Body.Token = res.Token
			out.Body.Invitation = &res.Invite
			out.Body.OrgName = res.OrgName
			sent := res.EmailSent
			out.Body.EmailSent = &sent
		}
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "revoke-invitation",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/invitations/{id}",
		Summary:     "Revoke a pending invitation",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RevokeInvitationInput) (*OKOutput, error) {
		if err := d.svc.RevokeInvitation(ctx, actor(ctx), in.Slug, in.ID); err != nil {
			return nil, apiErr(err, "could not revoke invitation")
		}
		return okOutput(), nil
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
		l, err := d.svc.InvitationByToken(ctx, in.Token)
		if err != nil {
			return nil, apiErr(err, "could not load invitation")
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
		Middlewares: huma.Middlewares{d.internal},
	}, func(ctx context.Context, in *AcceptInvitationInput) (*AcceptInvitationOutput, error) {
		slug, name, err := d.svc.AcceptInvitation(ctx, actor(ctx), in.Token)
		if err != nil {
			return nil, apiErr(err, "could not accept invitation")
		}
		out := &AcceptInvitationOutput{}
		out.Body.OrgSlug = slug
		out.Body.OrgName = name
		return out, nil
	})
}

// InvitationsInput lists an org's pending invitations (GET; search + keyset via
// ListParams).
type InvitationsInput struct {
	Slug string `path:"slug"`
	ListParams
}

// InvitationsQueryInput is the HTTP QUERY twin of InvitationsInput: the same list
// query carried in a JSON body.
type InvitationsQueryInput struct {
	Slug string `path:"slug"`
	Body ListBody
}

// InvitationsOutput is the pending-invitations list. Link carries the RFC 5988
// next-page header.
type InvitationsOutput struct {
	Link string `header:"Link"`
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
		Token      string         `json:"token,omitempty" doc:"Single-use invite token for the link (invited only). The API emails the link itself; the token is for callers that also deliver it another way"`
		Invitation *db.Invitation `json:"invitation,omitempty"`
		EmailSent  *bool          `json:"email_sent,omitempty" doc:"Whether the invitation email was handed to a mail provider that delivers (invited only). False when no provider is configured, the server only logs email (the log mail provider), or delivery failed; the invitation still exists and its link can be shared another way"`
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
