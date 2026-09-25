package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// registerProjectTeamsAPI wires team grants and ownership on projects. Team grants
// give a whole team a repository-style role on a project; owners are a separate
// tier above admin (delete/transfer/manage-owners), held by a user or a team.
// Managing grants needs effective project admin; managing owners needs owner.
func registerProjectTeamsAPI(api huma.API, d deps) {
	// list-project-teams is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listProjectTeams := func(ctx context.Context, slug, project string, q paginate.Query) (*ProjectTeamsOutput, error) {
		teams, next, err := d.svc.ListProjectTeams(ctx, actor(ctx), slug, project, q)
		if err != nil {
			return nil, apiErr(err, "could not list project teams")
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
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ProjectTeamsInput) (*ProjectTeamsOutput, error) {
		return listProjectTeams(ctx, in.Slug, in.Project, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-project-teams", "/orgs/{slug}/projects/{project}/teams",
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
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AddProjectTeamInput) (*OKOutput, error) {
		if err := d.svc.AddProjectTeam(ctx, actor(ctx), in.Slug, in.Project, in.Body.Team, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not grant team access")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-project-team-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/projects/{project}/teams/{team}/role",
		Summary:     "Change a team's role on a project",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *SetProjectTeamRoleInput) (*OKOutput, error) {
		if err := d.svc.SetProjectTeamRole(ctx, actor(ctx), in.Slug, in.Project, in.Team, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not change team role")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-team",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}/teams/{team}",
		Summary:     "Revoke a team's access to a project",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RemoveProjectTeamInput) (*OKOutput, error) {
		if err := d.svc.RemoveProjectTeam(ctx, actor(ctx), in.Slug, in.Project, in.Team); err != nil {
			return nil, apiErr(err, "could not revoke team access")
		}
		return okOutput(), nil
	})

	// list-project-owners is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listProjectOwners := func(ctx context.Context, slug, project string, q paginate.Query) (*ProjectOwnersOutput, error) {
		owners, next, err := d.svc.ListProjectOwners(ctx, actor(ctx), slug, project, q)
		if err != nil {
			return nil, apiErr(err, "could not list project owners")
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
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ProjectTeamsInput) (*ProjectOwnersOutput, error) {
		return listProjectOwners(ctx, in.Slug, in.Project, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-project-owners", "/orgs/{slug}/projects/{project}/owners",
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
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AddProjectOwnerInput) (*OKOutput, error) {
		if _, err := d.svc.AddProjectOwner(ctx, actor(ctx), in.Slug, in.Project, in.Body.Type, in.Body.Login); err != nil {
			return nil, apiErr(err, "could not add owner")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-owner",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}/owners/{type}/{principalId}",
		Summary:     "Remove an owner from a project",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RemoveProjectOwnerInput) (*OKOutput, error) {
		if err := d.svc.RemoveProjectOwner(ctx, actor(ctx), in.Slug, in.Project, in.Type, in.PrincipalID); err != nil {
			return nil, apiErr(err, "could not remove owner")
		}
		return okOutput(), nil
	})
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
