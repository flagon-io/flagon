package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
	"github.com/flagon-io/flagon/api/internal/service"
)

// registerProjectsAPI wires org-scoped projects (the core deployable unit). The
// service validates and slugs; the store enforces per-project access (effective
// project role from the org role, base permission, direct and team grants, plus
// ownership) in Go and again in RLS. A project the caller cannot view is 404;
// view without the needed capability is 403.
func registerProjectsAPI(api huma.API, d deps) {
	// list-projects is paginated: a documented GET (query-string params) plus a
	// Hidden QUERY twin (body params) sharing one fetch. See listing.go.
	listProjects := func(ctx context.Context, slug string, q paginate.Query) (*ProjectsOutput, error) {
		projects, next, err := d.svc.ListProjects(ctx, actor(ctx), slug, q)
		if err != nil {
			return nil, apiErr(err, "could not list projects")
		}
		out := &ProjectsOutput{}
		out.Body.Projects = projects
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/projects", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-projects",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects",
		Summary:     "List an organization's projects",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ProjectsListInput) (*ProjectsOutput, error) {
		return listProjects(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-projects", "/orgs/{slug}/projects",
		"List an organization's projects (QUERY)",
		func(ctx context.Context, in *ProjectsQueryInput) (*ProjectsOutput, error) {
			return listProjects(ctx, in.Slug, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "create-project",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/projects",
		Summary:       "Create a project",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *CreateProjectInput) (*ProjectOutput, error) {
		project, err := d.svc.CreateProject(ctx, actor(ctx), in.Slug, service.CreateProjectInput{
			Name:          in.Body.Name,
			Slug:          in.Body.Slug,
			Description:   in.Body.Description,
			Readme:        in.Body.Readme,
			RepositoryURL: in.Body.RepositoryURL,
		})
		if err != nil {
			return nil, apiErr(err, "could not create project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})

	// list-deleted-projects is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listDeletedProjects := func(ctx context.Context, slug string, q paginate.Query) (*ProjectsOutput, error) {
		projects, next, err := d.svc.ListDeletedProjects(ctx, actor(ctx), slug, q)
		if err != nil {
			return nil, apiErr(err, "could not list deleted projects")
		}
		out := &ProjectsOutput{}
		out.Body.Projects = projects
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/deleted-projects", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-deleted-projects",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/deleted-projects",
		Summary:     "List an organization's soft-deleted projects (restore archive)",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ProjectsListInput) (*ProjectsOutput, error) {
		return listDeletedProjects(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-deleted-projects", "/orgs/{slug}/deleted-projects",
		"List an organization's soft-deleted projects (QUERY)",
		func(ctx context.Context, in *ProjectsQueryInput) (*ProjectsOutput, error) {
			return listDeletedProjects(ctx, in.Slug, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID: "get-project",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects/{project}",
		Summary:     "Get a project",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *GetProjectInput) (*ProjectDetailOutput, error) {
		project, err := d.svc.GetProject(ctx, actor(ctx), in.Slug, in.Project)
		if err != nil {
			return nil, apiErr(err, "could not load project")
		}
		out := &ProjectDetailOutput{}
		out.Body.Project = project

		// expand[]: inline related objects on request. By default the
		// project carries only org_id; expand[]=organization embeds the org.
		expand := parseExpand(in.Expand)
		if expand.Has("organization") {
			org, err := d.svc.GetOrg(ctx, actor(ctx), in.Slug)
			if err != nil {
				return nil, apiErr(err, "could not expand organization")
			}
			out.Body.Organization = &org
		}
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "update-project",
		Method:      http.MethodPatch,
		Path:        "/orgs/{slug}/projects/{project}",
		Summary:     "Update a project",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *UpdateProjectInput) (*ProjectOutput, error) {
		project, err := d.svc.UpdateProject(ctx, actor(ctx), in.Slug, in.Project, service.UpdateProjectInput{
			Name:          in.Body.Name,
			Slug:          in.Body.Slug,
			Description:   in.Body.Description,
			Readme:        in.Body.Readme,
			RepositoryURL: in.Body.RepositoryURL,
		})
		if err != nil {
			return nil, apiErr(err, "could not update project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "delete-project",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}",
		Summary:     "Delete a project (soft delete; restorable)",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *GetProjectInput) (*ProjectOutput, error) {
		project, err := d.svc.DeleteProject(ctx, actor(ctx), in.Slug, in.Project)
		if err != nil {
			return nil, apiErr(err, "could not delete project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "restore-project",
		Method:      http.MethodPost,
		Path:        "/orgs/{slug}/projects/{project}/restore",
		Summary:     "Restore a soft-deleted project (within 30 days of deletion), optionally under a new slug",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RestoreProjectInput) (*ProjectOutput, error) {
		newSlug := ""
		if in.Body != nil {
			newSlug = in.Body.Slug
		}
		project, err := d.svc.RestoreProject(ctx, actor(ctx), in.Slug, in.Project, newSlug)
		if err != nil {
			return nil, apiErr(err, "could not restore project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})
}

// RestoreProjectInput restores a deleted project by its (old) slug, optionally
// under a new slug.
type RestoreProjectInput struct {
	Slug    string              `path:"slug"`
	Project string              `path:"project" doc:"The deleted project's slug"`
	Body    *RestoreProjectBody `required:"false"`
}

// RestoreProjectBody is the optional restore payload.
type RestoreProjectBody struct {
	Slug string `json:"slug,omitempty" doc:"A new slug; required when the old slug was taken while the project was deleted"`
}

// ProjectsListInput lists an org's projects (GET; search + keyset via ListParams).
type ProjectsListInput struct {
	Slug string `path:"slug"`
	ListParams
}

// ProjectsQueryInput is the HTTP QUERY twin of ProjectsListInput: the same list
// query carried in a JSON body.
type ProjectsQueryInput struct {
	Slug string `path:"slug"`
	Body ListBody
}

// CreateProjectInput creates a project.
type CreateProjectInput struct {
	Slug string `path:"slug"`
	Body struct {
		Name          string `json:"name" doc:"Display name" example:"Checkout Service"`
		Slug          string `json:"slug,omitempty" doc:"URL slug; derived from the name when omitted"`
		Description   string `json:"description,omitempty" doc:"One-line summary"`
		Readme        string `json:"readme,omitempty" doc:"Markdown README"`
		RepositoryURL string `json:"repository_url,omitempty" doc:"Source repository URL (linked source, later syncs the README)"`
	}
}

// GetProjectInput fetches one project by slug (also used by delete + restore).
// Expand accepts expand[] params (e.g. expand[]=organization).
type GetProjectInput struct {
	Slug    string   `path:"slug"`
	Project string   `path:"project"`
	Expand  []string `query:"expand[]" doc:"Related objects to inline, e.g. expand[]=organization"`
}

// ProjectDetailOutput is a single project plus any expanded relations. The
// project's own fields are inlined (embedded); expanded objects are added
// alongside only when requested via expand[].
type ProjectDetailOutput struct {
	Body struct {
		db.Project
		Organization *db.Org `json:"organization,omitempty"`
	}
}

// UpdateProjectInput is a partial edit; omitted fields are left unchanged.
type UpdateProjectInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Body    struct {
		Name          *string `json:"name,omitempty" doc:"Display name"`
		Slug          *string `json:"slug,omitempty" doc:"URL slug (renames the project)"`
		Description   *string `json:"description,omitempty" doc:"One-line summary"`
		Readme        *string `json:"readme,omitempty" doc:"Markdown README"`
		RepositoryURL *string `json:"repository_url,omitempty" doc:"Source repository URL"`
	}
}

// ProjectsOutput is the project list. Link carries the RFC 5988 next-page header.
type ProjectsOutput struct {
	Link string `header:"Link"`
	Body struct {
		Projects []db.Project `json:"projects"`
	}
}

// ProjectOutput is a single project.
type ProjectOutput struct {
	Body db.Project
}
