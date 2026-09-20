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

// registerProjectTeamsAPI wires team grants and ownership on projects. Team grants
// give a whole team a repository-style role on a project (GitHub-style); owners are
// a separate tier above admin (delete/transfer/manage-owners), held by a user or a
// team. Managing grants needs effective project admin; managing owners needs owner.
func registerProjectTeamsAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	// list-project-teams is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listProjectTeams := func(ctx context.Context, slug, project string, q paginate.Query) (*ProjectTeamsOutput, error) {
		actorID, _ := identity(ctx)
		teams, next, err := store.ListProjectTeams(ctx, actorID, slug, project, q)
		if err != nil {
			return nil, projectTeamErr(err, "could not list project teams")
		}
		out := &ProjectTeamsOutput{}
		out.Body.Teams = teams
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/projects/"+project+"/teams", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-project-teams",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects/{project}/teams",
		Summary:     "List the teams with access to a project",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *ProjectTeamsInput) (*ProjectTeamsOutput, error) {
		return listProjectTeams(ctx, in.Slug, in.Project, in.ListQuery())
	})
	registerQueryList(api, auth, "query-project-teams", "/orgs/{slug}/projects/{project}/teams",
		"List the teams with access to a project (QUERY)",
		func(ctx context.Context, in *ProjectTeamsQueryInput) (*ProjectTeamsOutput, error) {
			return listProjectTeams(ctx, in.Slug, in.Project, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "add-project-team",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/projects/{project}/teams",
		Summary:       "Grant a team a role on a project",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *AddProjectTeamInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.AddProjectTeam(ctx, actorID, in.Slug, in.Project,
			strings.TrimSpace(in.Body.Team), in.Body.Role); err != nil {
			return nil, projectTeamErr(err, "could not grant team access")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-project-team-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/projects/{project}/teams/{team}/role",
		Summary:     "Change a team's role on a project",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *SetProjectTeamRoleInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.SetProjectTeamRole(ctx, actorID, in.Slug, in.Project, in.Team, in.Body.Role); err != nil {
			return nil, projectTeamErr(err, "could not change team role")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-team",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}/teams/{team}",
		Summary:     "Revoke a team's access to a project",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *RemoveProjectTeamInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RemoveProjectTeam(ctx, actorID, in.Slug, in.Project, in.Team); err != nil {
			return nil, projectTeamErr(err, "could not revoke team access")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	// list-project-owners is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listProjectOwners := func(ctx context.Context, slug, project string, q paginate.Query) (*ProjectOwnersOutput, error) {
		actorID, _ := identity(ctx)
		owners, next, err := store.ListProjectOwners(ctx, actorID, slug, project, q)
		if err != nil {
			return nil, projectTeamErr(err, "could not list project owners")
		}
		out := &ProjectOwnersOutput{}
		out.Body.Owners = owners
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/projects/"+project+"/owners", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-project-owners",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects/{project}/owners",
		Summary:     "List a project's owners",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *ProjectTeamsInput) (*ProjectOwnersOutput, error) {
		return listProjectOwners(ctx, in.Slug, in.Project, in.ListQuery())
	})
	registerQueryList(api, auth, "query-project-owners", "/orgs/{slug}/projects/{project}/owners",
		"List a project's owners (QUERY)",
		func(ctx context.Context, in *ProjectTeamsQueryInput) (*ProjectOwnersOutput, error) {
			return listProjectOwners(ctx, in.Slug, in.Project, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "add-project-owner",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/projects/{project}/owners",
		Summary:       "Add an owner (user or team) to a project",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *AddProjectOwnerInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if _, err := store.AddProjectOwner(ctx, actorID, in.Slug, in.Project,
			in.Body.Type, strings.TrimSpace(in.Body.Login)); err != nil {
			return nil, projectTeamErr(err, "could not add owner")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-owner",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}/owners/{type}/{principalId}",
		Summary:     "Remove an owner from a project",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *RemoveProjectOwnerInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RemoveProjectOwner(ctx, actorID, in.Slug, in.Project, in.Type, in.PrincipalID); err != nil {
			return nil, projectTeamErr(err, "could not remove owner")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})
}

// projectTeamErr maps team-grant/owner errors to HTTP statuses.
func projectTeamErr(err error, fallback string) error {
	if e := cursorHTTPErr(err); e != nil {
		return e
	}
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrProjectNotFound):
		return huma.Error404NotFound("project not found")
	case errors.Is(err, db.ErrTeamNotFound):
		return huma.Error404NotFound("team not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	case errors.Is(err, db.ErrUserNotFound):
		return huma.Error404NotFound("no user with that email or username")
	case errors.Is(err, db.ErrTargetNotMember):
		return huma.Error409Conflict("that user must be an organization member first")
	case errors.Is(err, db.ErrAlreadyTeamGrant):
		return huma.Error409Conflict("that team already has a role on this project")
	case errors.Is(err, db.ErrNotTeamGrant):
		return huma.Error404NotFound("that team has no role on this project")
	case errors.Is(err, db.ErrAlreadyOwner):
		return huma.Error409Conflict("that principal already owns this project")
	case errors.Is(err, db.ErrNotOwner):
		return huma.Error404NotFound("that principal does not own this project")
	case errors.Is(err, db.ErrInvalidOwnerType):
		return huma.Error422UnprocessableEntity("owner type must be user or team")
	case errors.Is(err, db.ErrInvalidRole):
		return huma.Error422UnprocessableEntity("invalid role")
	default:
		return huma.Error500InternalServerError(fallback, err)
	}
}

// ProjectTeamsInput lists a project's team grants (also used for owners; GET,
// search + keyset via ListParams).
type ProjectTeamsInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	ListParams
}

// ProjectTeamsQueryInput is the HTTP QUERY twin of ProjectTeamsInput (shared by
// the team-grant and owner list QUERY endpoints): the same list query carried in
// a JSON body.
type ProjectTeamsQueryInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Body    ListBody
}

// ProjectTeamsOutput is the project team-grant list. Link carries the RFC 5988
// next-page header.
type ProjectTeamsOutput struct {
	Link string `header:"Link"`
	Body struct {
		Teams []db.ProjectTeam `json:"teams"`
	}
}

// AddProjectTeamInput grants a team a role on a project.
type AddProjectTeamInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Body    struct {
		Team string `json:"team" doc:"Team slug"`
		Role string `json:"role" enum:"read,triage,write,maintain,admin" doc:"Repository-style role to grant the team"`
	}
}

// SetProjectTeamRoleInput changes a team's role on a project.
type SetProjectTeamRoleInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Team    string `path:"team"`
	Body    struct {
		Role string `json:"role" enum:"read,triage,write,maintain,admin"`
	}
}

// RemoveProjectTeamInput revokes a team's access to a project.
type RemoveProjectTeamInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Team    string `path:"team"`
}

// ProjectOwnersOutput is the project owner list. Link carries the RFC 5988
// next-page header.
type ProjectOwnersOutput struct {
	Link string `header:"Link"`
	Body struct {
		Owners []db.ProjectOwner `json:"owners"`
	}
}

// AddProjectOwnerInput adds a user or team owner to a project.
type AddProjectOwnerInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Body    struct {
		Type  string `json:"type" enum:"user,team" doc:"Owner kind"`
		Login string `json:"login" doc:"For a user owner: an org member's email/username. For a team owner: the team slug."`
	}
}

// RemoveProjectOwnerInput removes an owner from a project.
type RemoveProjectOwnerInput struct {
	Slug        string `path:"slug"`
	Project     string `path:"project"`
	Type        string `path:"type" enum:"user,team"`
	PrincipalID string `path:"principalId"`
}
