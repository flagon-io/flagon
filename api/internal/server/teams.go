package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// registerTeamsAPI wires org-scoped teams (named groups of members that hold
// access to projects). Org owners/admins create and disband teams; a team's
// maintainers manage its membership. The store enforces RLS + the role rules.
func registerTeamsAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	// list-teams is paginated: a documented GET plus a Hidden QUERY twin sharing
	// one fetch. See listing.go.
	listTeams := func(ctx context.Context, slug string, q paginate.Query) (*TeamsOutput, error) {
		actorID, _ := identity(ctx)
		teams, next, err := store.ListTeams(ctx, actorID, slug, q)
		if err != nil {
			return nil, teamErr(err, "could not list teams")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *TeamsListInput) (*TeamsOutput, error) {
		return listTeams(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, auth, "query-teams", "/orgs/{slug}/teams",
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
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *CreateTeamInput) (*TeamOutput, error) {
		actorID, _ := identity(ctx)
		name := strings.TrimSpace(in.Body.Name)
		slug := slugify(in.Body.Slug)
		if slug == "" {
			slug = slugify(name)
		}
		if name == "" || slug == "" {
			return nil, huma.Error422UnprocessableEntity("name is required and must contain a letter or digit")
		}
		team, err := store.CreateTeam(ctx, actorID, in.Slug, db.TeamInput{
			Name:        name,
			Slug:        slug,
			Description: strings.TrimSpace(in.Body.Description),
		})
		if err != nil {
			return nil, teamErr(err, "could not create team")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *TeamInput) (*TeamOutput, error) {
		actorID, _ := identity(ctx)
		team, err := store.GetTeam(ctx, actorID, in.Slug, in.Team)
		if err != nil {
			return nil, teamErr(err, "could not load team")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *UpdateTeamInput) (*TeamOutput, error) {
		actorID, _ := identity(ctx)
		update := db.TeamUpdate{Description: in.Body.Description}
		if in.Body.Name != nil {
			name := strings.TrimSpace(*in.Body.Name)
			if name == "" {
				return nil, huma.Error422UnprocessableEntity("name cannot be empty")
			}
			update.Name = &name
		}
		if in.Body.Slug != nil {
			slug := slugify(*in.Body.Slug)
			if slug == "" {
				return nil, huma.Error422UnprocessableEntity("slug must contain a letter or digit")
			}
			update.Slug = &slug
		}
		team, err := store.UpdateTeam(ctx, actorID, in.Slug, in.Team, update)
		if err != nil {
			return nil, teamErr(err, "could not update team")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *TeamInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.DeleteTeam(ctx, actorID, in.Slug, in.Team); err != nil {
			return nil, teamErr(err, "could not delete team")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	// list-team-members is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listTeamMembers := func(ctx context.Context, slug, team string, q paginate.Query) (*TeamMembersOutput, error) {
		actorID, _ := identity(ctx)
		members, next, err := store.ListTeamMembers(ctx, actorID, slug, team, q)
		if err != nil {
			return nil, teamErr(err, "could not list team members")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *TeamMembersListInput) (*TeamMembersOutput, error) {
		return listTeamMembers(ctx, in.Slug, in.Team, in.ListQuery())
	})
	registerQueryList(api, auth, "query-team-members", "/orgs/{slug}/teams/{team}/members",
		"List a team's members (QUERY)",
		func(ctx context.Context, in *TeamMembersQueryInput) (*TeamMembersOutput, error) {
			return listTeamMembers(ctx, in.Slug, in.Team, in.Body.ListQuery())
		})

	// list-team-projects is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listTeamProjects := func(ctx context.Context, slug, team string, q paginate.Query) (*TeamProjectsOutput, error) {
		actorID, _ := identity(ctx)
		projects, next, err := store.ListTeamProjects(ctx, actorID, slug, team, q)
		if err != nil {
			return nil, teamErr(err, "could not list team projects")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *TeamProjectsListInput) (*TeamProjectsOutput, error) {
		return listTeamProjects(ctx, in.Slug, in.Team, in.ListQuery())
	})
	registerQueryList(api, auth, "query-team-projects", "/orgs/{slug}/teams/{team}/projects",
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
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *AddTeamMemberInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		targetID, err := store.AddTeamMember(ctx, actorID, in.Slug, in.Team,
			strings.TrimSpace(in.Body.Login), in.Body.Role)
		if err != nil {
			return nil, teamErr(err, "could not add team member")
		}
		_ = store.CreateNotification(ctx, targetID, nil, "team.member_added",
			"You were added to a team",
			"You are now a "+in.Body.Role+" of the "+in.Team+" team.",
			"/"+in.Slug+"/teams/"+in.Team)
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-team-member-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/teams/{team}/members/{userId}/role",
		Summary:     "Change a team member's role",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *SetTeamMemberRoleInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.SetTeamMemberRole(ctx, actorID, in.Slug, in.Team, in.UserID, in.Body.Role); err != nil {
			return nil, teamErr(err, "could not change team member role")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-team-member",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/teams/{team}/members/{userId}",
		Summary:     "Remove a member from a team",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *RemoveTeamMemberInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RemoveTeamMember(ctx, actorID, in.Slug, in.Team, in.UserID); err != nil {
			return nil, teamErr(err, "could not remove team member")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})
}

// teamErr maps team store errors to HTTP statuses.
func teamErr(err error, fallback string) error {
	if e := cursorHTTPErr(err); e != nil {
		return e
	}
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrTeamNotFound):
		return huma.Error404NotFound("team not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	case errors.Is(err, db.ErrTeamSlugTaken):
		return huma.Error409Conflict("a team with that slug already exists")
	case errors.Is(err, db.ErrUserNotFound):
		return huma.Error404NotFound("no user with that email or username")
	case errors.Is(err, db.ErrTargetNotMember):
		return huma.Error409Conflict("that user must be an organization member first")
	case errors.Is(err, db.ErrAlreadyTeamMember):
		return huma.Error409Conflict("that user is already on this team")
	case errors.Is(err, db.ErrNotTeamMember):
		return huma.Error404NotFound("that user is not on this team")
	case errors.Is(err, db.ErrInvalidRole):
		return huma.Error422UnprocessableEntity("invalid role")
	default:
		return huma.Error500InternalServerError(fallback, err)
	}
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
