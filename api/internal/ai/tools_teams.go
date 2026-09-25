package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// Team tools (server/teams.go).
func registerTeamTools(r *Registry, svc *service.Service) {
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_teams",
			Description: "List an organization's teams (named groups of members) with their member counts.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:team",
		Operation: "list-teams",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			teams, _, err := svc.ListTeams(ctx, tc.actor(), in.Org, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"teams": teams}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_team",
			Description: "Get one team in an organization by its slug.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:     "read:team",
		Operation: "get-team",
		Run: run(func(ctx context.Context, tc ToolContext, in teamArg) (any, error) {
			t, err := svc.GetTeam(ctx, tc.actor(), in.Org, in.Team)
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": t}, nil
		}),
	})

	type createInput struct {
		Org         string `json:"org" tool:"required"`
		Name        string `json:"name" tool:"required"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "create_team",
			Description: "Create a team in an organization. The slug is derived from the name if not given. The creator becomes the team's first maintainer.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"name":{"type":"string","description":"Team name"},"slug":{"type":"string","description":"Optional slug; derived from the name when omitted"},"description":{"type":"string","description":"Optional one-line summary"}},"required":["org","name"],"additionalProperties":false}`),
		},
		Scope:     "write:team",
		Operation: "create-team",
		Mutating:  true,
		Summarize: summarize(func(in createInput) string {
			return fmt.Sprintf("Create team %q in %q", in.Name, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in createInput) (any, error) {
			t, err := svc.CreateTeam(ctx, tc.actor(), in.Org, service.CreateTeamInput{
				Name: in.Name, Slug: in.Slug, Description: in.Description,
			})
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": t}, nil
		}),
	})

	// Pointers so an omitted field stays unchanged (partial update).
	type updateInput struct {
		Org         string  `json:"org" tool:"required"`
		Team        string  `json:"team" tool:"required"`
		Name        *string `json:"name"`
		Slug        *string `json:"slug"`
		Description *string `json:"description"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "update_team",
			Description: "Update a team's name, slug (renames it), or description. Only the fields you pass change.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"name":{"type":"string"},"slug":{"type":"string"},"description":{"type":"string"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:     "write:team",
		Operation: "update-team",
		Mutating:  true,
		Summarize: summarize(func(in updateInput) string {
			return fmt.Sprintf("Update team %q in %q", in.Team, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in updateInput) (any, error) {
			t, err := svc.UpdateTeam(ctx, tc.actor(), in.Org, in.Team, service.UpdateTeamInput{
				Name: in.Name, Slug: in.Slug, Description: in.Description,
			})
			if err != nil {
				return nil, err
			}
			return map[string]any{"team": t}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "delete_team",
			Description: "Delete a team. Its project grants and ownerships stop having effect. Org owners/admins only.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:     "admin:team",
		Operation: "delete-team",
		Mutating:  true,
		Summarize: summarize(func(in teamArg) string {
			return fmt.Sprintf("Delete team %q in %q", in.Team, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in teamArg) (any, error) {
			if err := svc.DeleteTeam(ctx, tc.actor(), in.Org, in.Team); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_team_members",
			Description: "List a team's members and their team roles (maintainer or member).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:     "read:team",
		Operation: "list-team-members",
		Run: run(func(ctx context.Context, tc ToolContext, in teamArg) (any, error) {
			members, _, err := svc.ListTeamMembers(ctx, tc.actor(), in.Org, in.Team, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"members": members}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_team_projects",
			Description: "List the projects a team has access to and the repository-style role granted to the team on each.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"}},"required":["org","team"],"additionalProperties":false}`),
		},
		Scope:     "read:team",
		Operation: "list-team-projects",
		Run: run(func(ctx context.Context, tc ToolContext, in teamArg) (any, error) {
			projects, _, err := svc.ListTeamProjects(ctx, tc.actor(), in.Org, in.Team, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"projects": projects}, nil
		}),
	})

	type addMemberInput struct {
		Org   string `json:"org" tool:"required"`
		Team  string `json:"team" tool:"required"`
		Login string `json:"login" tool:"required"`
		Role  string `json:"role" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "add_team_member",
			Description: "Add an existing org member to a team as a maintainer or member.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"login":{"type":"string","description":"Username or email of an existing org member"},"role":{"type":"string","description":"Team role: maintainer or member"}},"required":["org","team","login","role"],"additionalProperties":false}`),
		},
		Scope:     "write:team",
		Operation: "add-team-member",
		Mutating:  true,
		Summarize: summarize(func(in addMemberInput) string {
			return fmt.Sprintf("Add %q to team %q in %q as %s", in.Login, in.Team, in.Org, in.Role)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in addMemberInput) (any, error) {
			targetID, err := svc.AddTeamMember(ctx, tc.actor(), in.Org, in.Team, in.Login, in.Role)
			if err != nil {
				return nil, err
			}
			return map[string]any{"user_id": targetID}, nil
		}),
	})

	type setRoleInput struct {
		Org    string `json:"org" tool:"required"`
		Team   string `json:"team" tool:"required"`
		UserID string `json:"user_id" tool:"required"`
		Role   string `json:"role" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "set_team_member_role",
			Description: "Change a team member's role (maintainer or member). Identify them by user id (from list_team_members).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"user_id":{"type":"string","description":"The member's user id"},"role":{"type":"string","description":"New role: maintainer or member"}},"required":["org","team","user_id","role"],"additionalProperties":false}`),
		},
		Scope:     "write:team",
		Operation: "set-team-member-role",
		Mutating:  true,
		Summarize: summarize(func(in setRoleInput) string {
			return fmt.Sprintf("Set role of %q on team %q in %q to %s", in.UserID, in.Team, in.Org, in.Role)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in setRoleInput) (any, error) {
			if err := svc.SetTeamMemberRole(ctx, tc.actor(), in.Org, in.Team, in.UserID, in.Role); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})

	type removeMemberInput struct {
		Org    string `json:"org" tool:"required"`
		Team   string `json:"team" tool:"required"`
		UserID string `json:"user_id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "remove_team_member",
			Description: "Remove a member from a team. Identify them by user id (from list_team_members).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"team":{"type":"string","description":"Team slug"},"user_id":{"type":"string","description":"The member's user id"}},"required":["org","team","user_id"],"additionalProperties":false}`),
		},
		Scope:     "write:team",
		Operation: "remove-team-member",
		Mutating:  true,
		Summarize: summarize(func(in removeMemberInput) string {
			return fmt.Sprintf("Remove %q from team %q in %q", in.UserID, in.Team, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in removeMemberInput) (any, error) {
			if err := svc.RemoveTeamMember(ctx, tc.actor(), in.Org, in.Team, in.UserID); err != nil {
				return nil, err
			}
			return ok(), nil
		}),
	})
}
