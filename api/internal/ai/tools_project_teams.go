package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Project team-grant and ownership tools (server/project_teams.go).
func registerProjectTeamTools(r *Registry, svc *service.Service) {
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_project_teams",
			Description: "List the teams granted access to a project and their repository-style roles.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "read:project",
		Operation: "list-project-teams",
		Run: run(func(ctx context.Context, tc ToolContext, in projectArg) (any, error) {
			teams, _, err := svc.ListProjectTeams(ctx, tc.actor(), in.Org, in.Project, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"teams": teams}, nil
		}),
	})

	type grantInput struct {
		Org     string `json:"org" tool:"required"`
		Project string `json:"project" tool:"required"`
		Team    string `json:"team" tool:"required"`
		Role    string `json:"role" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "add_project_team",
			Description: "Grant a team a repository-style role on a project (read, triage, write, maintain, or admin). Every member of the team inherits that access on the project.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"team":{"type":"string","description":"Team slug"},"role":{"type":"string","description":"Role: read, triage, write, maintain, or admin"}},"required":["org","project","team","role"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "add-project-team",
		Mutating:  true,
		Summarize: summarize(func(in grantInput) string {
			return fmt.Sprintf("Grant team %q %s on project %q in %q", in.Team, in.Role, in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in grantInput) (any, error) {
			if err := svc.AddProjectTeam(ctx, tc.actor(), in.Org, in.Project, in.Team, in.Role); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "set_project_team_role",
			Description: "Change a team's role on a project.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"team":{"type":"string","description":"Team slug"},"role":{"type":"string","description":"New role: read, triage, write, maintain, or admin"}},"required":["org","project","team","role"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "set-project-team-role",
		Mutating:  true,
		Summarize: summarize(func(in grantInput) string {
			return fmt.Sprintf("Set team %q role on project %q in %q to %s", in.Team, in.Project, in.Org, in.Role)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in grantInput) (any, error) {
			if err := svc.SetProjectTeamRole(ctx, tc.actor(), in.Org, in.Project, in.Team, in.Role); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	type revokeInput struct {
		Org     string `json:"org" tool:"required"`
		Project string `json:"project" tool:"required"`
		Team    string `json:"team" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_project_team",
			Description: "Revoke a team's access to a project.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","project","team"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "remove-project-team",
		Mutating:  true,
		Summarize: summarize(func(in revokeInput) string {
			return fmt.Sprintf("Revoke team %q on project %q in %q", in.Team, in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in revokeInput) (any, error) {
			if err := svc.RemoveProjectTeam(ctx, tc.actor(), in.Org, in.Project, in.Team); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_project_owners",
			Description: "List a project's owners (individual users and teams). Owners are a tier above admin: they can delete/transfer the project and manage its owners.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "read:project",
		Operation: "list-project-owners",
		Run: run(func(ctx context.Context, tc ToolContext, in projectArg) (any, error) {
			owners, _, err := svc.ListProjectOwners(ctx, tc.actor(), in.Org, in.Project, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"owners": owners}, nil
		}),
	})

	type addOwnerInput struct {
		Org     string `json:"org" tool:"required"`
		Project string `json:"project" tool:"required"`
		Type    string `json:"type" tool:"required"`
		Login   string `json:"login" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "add_project_owner",
			Description: "Make a user or a team an owner of a project (the tier above admin). For a user owner, login is an org member's username/email; for a team owner, login is the team slug.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"type":{"type":"string","description":"Owner kind: user or team"},"login":{"type":"string","description":"For a user owner: an org member's username/email. For a team owner: the team slug."}},"required":["org","project","type","login"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "add-project-owner",
		Mutating:  true,
		Summarize: summarize(func(in addOwnerInput) string {
			return fmt.Sprintf("Make %s %q an owner of project %q in %q", in.Type, in.Login, in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in addOwnerInput) (any, error) {
			principalID, err := svc.AddProjectOwner(ctx, tc.actor(), in.Org, in.Project, in.Type, in.Login)
			if err != nil {
				return nil, err
			}
			return map[string]any{"principal_id": principalID}, nil
		}),
	})

	type removeOwnerInput struct {
		Org         string `json:"org" tool:"required"`
		Project     string `json:"project" tool:"required"`
		Type        string `json:"type" tool:"required"`
		PrincipalID string `json:"principal_id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_project_owner",
			Description: "Remove an owner (user or team) from a project. Identify them by the principal id and type from list_project_owners.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"},"type":{"type":"string","description":"Owner kind: user or team"},"principal_id":{"type":"string","description":"The owner's user id (user) or team id (team)"}},"required":["org","project","type","principal_id"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "remove-project-owner",
		Mutating:  true,
		Summarize: summarize(func(in removeOwnerInput) string {
			return fmt.Sprintf("Remove %s owner %q from project %q in %q", in.Type, in.PrincipalID, in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in removeOwnerInput) (any, error) {
			if err := svc.RemoveProjectOwner(ctx, tc.actor(), in.Org, in.Project, in.Type, in.PrincipalID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})
}
