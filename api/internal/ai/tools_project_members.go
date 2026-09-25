package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Project collaborator tools (server/project_members.go).
func registerProjectMemberTools(r *Registry, svc *service.Service) {
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_project_members",
			Description: "List a project's explicit collaborators and their repository-style roles (read, triage, write, maintain, admin). Org owners/admins have admin on every project implicitly and may not appear here.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "read:project",
		Operation: "list-project-members",
		Run: run(func(ctx context.Context, tc ToolContext, in projectArg) (any, error) {
			members, _, err := svc.ListProjectMembers(ctx, tc.actor(), in.Org, in.Project, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": members}, nil
		}),
	})

	type addInput struct {
		Org     string `json:"org" tool:"required"`
		Project string `json:"project" tool:"required"`
		Login   string `json:"login" tool:"required"`
		Role    string `json:"role" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "add_project_member",
			Description: "Grant an existing org member a role on a project (read, triage, write, maintain, or admin). A grant only elevates the member on this project; it never lowers their org-level access.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"login":{"type":"string","description":"Username or email of an existing org member"},"role":{"type":"string","description":"Role: read, triage, write, maintain, or admin"}},"required":["org","project","login","role"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "add-project-member",
		Mutating:  true,
		Summarize: summarize(func(in addInput) string {
			return fmt.Sprintf("Grant %q %s on project %q in %q", in.Login, in.Role, in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in addInput) (any, error) {
			targetID, err := svc.AddProjectMember(ctx, tc.actor(), in.Org, in.Project, in.Login, in.Role)
			if err != nil {
				return nil, err
			}
			return map[string]any{"user_id": targetID}, nil
		}),
	})

	type setRoleInput struct {
		Org     string `json:"org" tool:"required"`
		Project string `json:"project" tool:"required"`
		UserID  string `json:"user_id" tool:"required"`
		Role    string `json:"role" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "set_project_member_role",
			Description: "Change a collaborator's role on a project. Identify the collaborator by their user id (from list_project_members).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"user_id":{"type":"string","description":"The collaborator's user id"},"role":{"type":"string","description":"New role: read, triage, write, maintain, or admin"}},"required":["org","project","user_id","role"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "set-project-member-role",
		Mutating:  true,
		Summarize: summarize(func(in setRoleInput) string {
			return fmt.Sprintf("Set role of %q on project %q in %q to %s", in.UserID, in.Project, in.Org, in.Role)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in setRoleInput) (any, error) {
			if err := svc.SetProjectMemberRole(ctx, tc.actor(), in.Org, in.Project, in.UserID, in.Role); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	type removeInput struct {
		Org     string `json:"org" tool:"required"`
		Project string `json:"project" tool:"required"`
		UserID  string `json:"user_id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_project_member",
			Description: "Revoke a collaborator's role on a project, dropping them back to their org-level access. Identify the collaborator by their user id (from list_project_members).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"user_id":{"type":"string","description":"The collaborator's user id"}},"required":["org","project","user_id"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "remove-project-member",
		Mutating:  true,
		Summarize: summarize(func(in removeInput) string {
			return fmt.Sprintf("Revoke %q on project %q in %q", in.UserID, in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in removeInput) (any, error) {
			if err := svc.RemoveProjectMember(ctx, tc.actor(), in.Org, in.Project, in.UserID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})
}
