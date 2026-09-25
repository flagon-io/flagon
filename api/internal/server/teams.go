package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
	"github.com/flagon-io/flagon/api/internal/service"
)

// registerTeamsAPI wires org-scoped teams (named groups of members that hold
// access to projects). Org owners/admins create and disband teams; a team's
// maintainers manage its membership. The store enforces RLS + the role rules.
func registerTeamsAPI(api huma.API, d deps) {
	// list-teams is paginated: a documented GET plus a Hidden QUERY twin sharing
	// one fetch. See listing.go.
	listTeams := func(ctx context.Context, slug string, q paginate.Query) (*TeamsOutput, error) {
		teams, next, err := d.svc.ListTeams(ctx, actor(ctx), slug, q)
		if err != nil {
			return nil, apiErr(err, "could not list teams")
		}
		out := &TeamsOutput{}
		out.Body.Teams = teams
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/teams", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-teams",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/teams",
		Summary:     "List an organization's teams",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *TeamsListInput) (*TeamsOutput, error) {
		return listTeams(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-teams", "/orgs/{slug}/teams",
		"List an organization's teams (QUERY)",
		func(ctx context.Context, in *TeamsQueryInput) (*TeamsOutput, error) {
			return listTeams(ctx, in.Slug, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "create-team",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/teams",
		Summary:       "Create a team",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *CreateTeamInput) (*TeamOutput, error) {
		team, err := d.svc.CreateTeam(ctx, actor(ctx), in.Slug, service.CreateTeamInput{
			Name:        in.Body.Name,
			Slug:        in.Body.Slug,
			Description: in.Body.Description,
		})
		if err != nil {
			return nil, apiErr(err, "could not create team")
		}
		out := &TeamOutput{}
		out.Body = team
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-team",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/teams/{team}",
		Summary:     "Get a team",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *TeamInput) (*TeamOutput, error) {
		team, err := d.svc.GetTeam(ctx, actor(ctx), in.Slug, in.Team)
		if err != nil {
			return nil, apiErr(err, "could not load team")
		}
		out := &TeamOutput{}
		out.Body = team
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "update-team",
		Method:      http.MethodPatch,
		Path:        "/orgs/{slug}/teams/{team}",
		Summary:     "Update a team",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *UpdateTeamInput) (*TeamOutput, error) {
		team, err := d.svc.UpdateTeam(ctx, actor(ctx), in.Slug, in.Team, service.UpdateTeamInput{
			Name:        in.Body.Name,
			Slug:        in.Body.Slug,
			Description: in.Body.Description,
		})
		if err != nil {
			return nil, apiErr(err, "could not update team")
		}
		out := &TeamOutput{}
		out.Body = team
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "delete-team",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/teams/{team}",
		Summary:     "Delete a team",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *TeamInput) (*OKOutput, error) {
		if err := d.svc.DeleteTeam(ctx, actor(ctx), in.Slug, in.Team); err != nil {
			return nil, apiErr(err, "could not delete team")
		}
		return okOutput(), nil
	})

	// list-team-members is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listTeamMembers := func(ctx context.Context, slug, team string, q paginate.Query) (*TeamMembersOutput, error) {
		members, next, err := d.svc.ListTeamMembers(ctx, actor(ctx), slug, team, q)
		if err != nil {
			return nil, apiErr(err, "could not list team members")
		}
		out := &TeamMembersOutput{}
		out.Body.Members = members
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/teams/"+team+"/members", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-team-members",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/teams/{team}/members",
		Summary:     "List a team's members",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *TeamMembersListInput) (*TeamMembersOutput, error) {
		return listTeamMembers(ctx, in.Slug, in.Team, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-team-members", "/orgs/{slug}/teams/{team}/members",
		"List a team's members (QUERY)",
		func(ctx context.Context, in *TeamMembersQueryInput) (*TeamMembersOutput, error) {
			return listTeamMembers(ctx, in.Slug, in.Team, in.Body.ListQuery())
		})

	// list-team-projects is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listTeamProjects := func(ctx context.Context, slug, team string, q paginate.Query) (*TeamProjectsOutput, error) {
		projects, next, err := d.svc.ListTeamProjects(ctx, actor(ctx), slug, team, q)
		if err != nil {
			return nil, apiErr(err, "could not list team projects")
		}
		out := &TeamProjectsOutput{}
		out.Body.Projects = projects
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/teams/"+team+"/projects", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-team-projects",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/teams/{team}/projects",
		Summary:     "List the projects a team has access to",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *TeamProjectsListInput) (*TeamProjectsOutput, error) {
		return listTeamProjects(ctx, in.Slug, in.Team, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-team-projects", "/orgs/{slug}/teams/{team}/projects",
		"List the projects a team has access to (QUERY)",
		func(ctx context.Context, in *TeamProjectsQueryInput) (*TeamProjectsOutput, error) {
			return listTeamProjects(ctx, in.Slug, in.Team, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "add-team-member",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/teams/{team}/members",
		Summary:       "Add an org member to a team",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AddTeamMemberInput) (*OKOutput, error) {
		if _, err := d.svc.AddTeamMember(ctx, actor(ctx), in.Slug, in.Team, in.Body.Login, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not add team member")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-team-member-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/teams/{team}/members/{userId}/role",
		Summary:     "Change a team member's role",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *SetTeamMemberRoleInput) (*OKOutput, error) {
		if err := d.svc.SetTeamMemberRole(ctx, actor(ctx), in.Slug, in.Team, in.UserID, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not change team member role")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-team-member",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/teams/{team}/members/{userId}",
		Summary:     "Remove a member from a team",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RemoveTeamMemberInput) (*OKOutput, error) {
		if err := d.svc.RemoveTeamMember(ctx, actor(ctx), in.Slug, in.Team, in.UserID); err != nil {
			return nil, apiErr(err, "could not remove team member")
		}
		return okOutput(), nil
	})
}

// TeamsListInput lists an org's teams (GET; search + keyset via ListParams).
type TeamsListInput struct {
	Slug string `path:"slug"`
	ListParams
}

// TeamsQueryInput is the HTTP QUERY twin of TeamsListInput: the same list query
// carried in a JSON body.
type TeamsQueryInput struct {
	Slug string `path:"slug"`
	Body ListBody
}

// TeamsOutput is the team list. Link carries the RFC 5988 next-page header.
type TeamsOutput struct {
	Link string `header:"Link"`
	Body struct {
		Teams []db.Team `json:"teams"`
	}
}

// TeamOutput is a single team.
type TeamOutput struct {
	Body db.Team
}

// CreateTeamInput creates a team.
type CreateTeamInput struct {
	Slug string `path:"slug"`
	Body struct {
		Name        string `json:"name" doc:"Display name" example:"Platform"`
		Slug        string `json:"slug,omitempty" doc:"URL slug; derived from the name when omitted"`
		Description string `json:"description,omitempty" doc:"One-line summary"`
	}
}

// TeamInput fetches, deletes, or lists members of one team by slug.
type TeamInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
}

// UpdateTeamInput is a partial edit; omitted fields are left unchanged.
type UpdateTeamInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
	Body struct {
		Name        *string `json:"name,omitempty" doc:"Display name"`
		Slug        *string `json:"slug,omitempty" doc:"URL slug (renames the team)"`
		Description *string `json:"description,omitempty" doc:"One-line summary"`
	}
}

// TeamMembersListInput lists a team's members (GET; search + keyset via
// ListParams).
type TeamMembersListInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
	ListParams
}

// TeamMembersQueryInput is the HTTP QUERY twin of TeamMembersListInput: the same
// list query carried in a JSON body.
type TeamMembersQueryInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
	Body ListBody
}

// TeamMembersOutput is a team's member list. Link carries the RFC 5988 next-page
// header.
type TeamMembersOutput struct {
	Link string `header:"Link"`
	Body struct {
		Members []db.TeamMember `json:"members"`
	}
}

// TeamProjectsListInput lists the projects a team has access to (GET; search +
// keyset via ListParams).
type TeamProjectsListInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
	ListParams
}

// TeamProjectsQueryInput is the HTTP QUERY twin of TeamProjectsListInput: the
// same list query carried in a JSON body.
type TeamProjectsQueryInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
	Body ListBody
}

// TeamProjectsOutput is the list of projects a team has access to. Link carries
// the RFC 5988 next-page header.
type TeamProjectsOutput struct {
	Link string `header:"Link"`
	Body struct {
		Projects []db.TeamProject `json:"projects"`
	}
}

// AddTeamMemberInput adds an org member to a team.
type AddTeamMemberInput struct {
	Slug string `path:"slug"`
	Team string `path:"team"`
	Body struct {
		Login string `json:"login" doc:"Email or username of an existing org member"`
		Role  string `json:"role" enum:"maintainer,member" doc:"Team role"`
	}
}

// SetTeamMemberRoleInput changes a team member's role.
type SetTeamMemberRoleInput struct {
	Slug   string `path:"slug"`
	Team   string `path:"team"`
	UserID string `path:"userId"`
	Body   struct {
		Role string `json:"role" enum:"maintainer,member"`
	}
}

// RemoveTeamMemberInput removes a member from a team.
type RemoveTeamMemberInput struct {
	Slug   string `path:"slug"`
	Team   string `path:"team"`
	UserID string `path:"userId"`
}
