package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Org member tools (server/members.go).
func registerMemberTools(r *Registry, svc *service.Service) {
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_members",
			Description: "List the members of an organization, with their role.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "list-members",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			members, _, err := svc.ListMembers(ctx, tc.actor(), in.Org, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": members}, nil
		}),
	})

	type addInput struct {
		Org   string `json:"org" tool:"required"`
		Login string `json:"login" tool:"required"`
		Role  string `json:"role"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "add_member",
			Description: "Add an existing Flagon user to an organization by their username or email. Use invite_member for someone without an account.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"login":{"type":"string","description":"Username or email of an existing user"},"role":{"type":"string","description":"Role: member (default) or admin. Owners cannot be invited; promote a member instead"}},"required":["org","login"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "add-member",
		Mutating:  true,
		Summarize: summarize(func(in addInput) string {
			return fmt.Sprintf("Add %q to %q as %s", in.Login, in.Org, orDefault(in.Role, "member"))
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in addInput) (any, error) {
			targetID, orgName, err := svc.AddMember(ctx, tc.actor(), in.Org, in.Login, in.Role)
			if err != nil {
				return nil, err
			}
			return map[string]any{"user_id": targetID, "organization": orgName}, nil
		}),
	})

	type setRoleInput struct {
		Org    string `json:"org" tool:"required"`
		UserID string `json:"user_id" tool:"required"`
		Role   string `json:"role" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "set_member_role",
			Description: "Change a member's role in an organization. Identify the member by their user id (from list_members).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"user_id":{"type":"string","description":"The member's user id"},"role":{"type":"string","description":"New role: member, admin, or owner"}},"required":["org","user_id","role"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "set-member-role",
		Mutating:  true,
		Summarize: summarize(func(in setRoleInput) string {
			return fmt.Sprintf("Set role of %q in %q to %s", in.UserID, in.Org, in.Role)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in setRoleInput) (any, error) {
			if err := svc.SetMemberRole(ctx, tc.actor(), in.Org, in.UserID, in.Role); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	type removeInput struct {
		Org    string `json:"org" tool:"required"`
		UserID string `json:"user_id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_member",
			Description: "Remove a member from an organization. Identify the member by their user id (from list_members).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"user_id":{"type":"string","description":"The member's user id"}},"required":["org","user_id"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "remove-member",
		Mutating:  true,
		Summarize: summarize(func(in removeInput) string {
			return fmt.Sprintf("Remove %q from %q", in.UserID, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in removeInput) (any, error) {
			if err := svc.RemoveMember(ctx, tc.actor(), in.Org, in.UserID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})
}

// Invitation tools (server/invitations.go).
func registerInvitationTools(r *Registry, svc *service.Service) {
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_invitations",
			Description: "List the pending invitations for an organization.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "list-invitations",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			invites, _, err := svc.ListInvitations(ctx, tc.actor(), in.Org, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"invitations": invites}, nil
		}),
	})

	type inviteInput struct {
		Org   string `json:"org" tool:"required"`
		Email string `json:"email" tool:"required"`
		Role  string `json:"role"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "invite_member",
			Description: "Invite someone to an organization by email. If they already have a Flagon account they are added directly; otherwise an email invitation is sent.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"email":{"type":"string","description":"Email address to invite"},"role":{"type":"string","description":"Role: member (default), admin, or owner"}},"required":["org","email"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "invite-member",
		Mutating:  true,
		Summarize: summarize(func(in inviteInput) string {
			return fmt.Sprintf("Invite %q to %q as %s", in.Email, in.Org, orDefault(in.Role, "member"))
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in inviteInput) (any, error) {
			res, err := svc.InviteMember(ctx, tc.actor(), in.Org, in.Email, in.Role)
			if err != nil {
				return nil, err
			}
			// Never surface the plaintext invite token to the model; the API delivers
			// it out of band (email).
			out := map[string]any{"status": res.Status, "organization": res.OrgName, "email": res.Email}
			if res.Status == "invited" {
				out["email_sent"] = res.EmailSent
			}
			return out, nil
		}),
	})

	type revokeInput struct {
		Org string `json:"org" tool:"required"`
		ID  string `json:"id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "revoke_invitation",
			Description: "Revoke a pending invitation by its id (from list_invitations).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"id":{"type":"string","description":"Invitation id"}},"required":["org","id"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "revoke-invitation",
		Mutating:  true,
		Summarize: summarize(func(in revokeInput) string {
			return fmt.Sprintf("Revoke invitation %q in %q", in.ID, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in revokeInput) (any, error) {
			if err := svc.RevokeInvitation(ctx, tc.actor(), in.Org, in.ID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})
}
