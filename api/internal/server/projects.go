package server

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
)

// registerProjectsAPI wires org-scoped projects (the core deployable unit). The
// store enforces RLS (org membership) and role (viewers are read-only).
func registerProjectsAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "list-projects",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects",
		Summary:     "List an organization's projects",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *ProjectsListInput) (*ProjectsOutput, error) {
		actorID, _ := identity(ctx)
		projects, err := store.ListProjects(ctx, actorID, in.Slug)
		if err != nil {
			return nil, projectErr(err, "could not list projects")
		}
		out := &ProjectsOutput{}
		out.Body.Projects = projects
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "create-project",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/projects",
		Summary:       "Create a project",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *CreateProjectInput) (*ProjectOutput, error) {
		actorID, _ := identity(ctx)
		name := strings.TrimSpace(in.Body.Name)
		slug := slugify(in.Body.Slug)
		if slug == "" {
			slug = slugify(name)
		}
		if name == "" || slug == "" {
			return nil, huma.Error422UnprocessableEntity("name is required and must contain a letter or digit")
		}
		project, err := store.CreateProject(ctx, actorID, in.Slug, db.ProjectInput{
			Name:          name,
			Slug:          slug,
			Description:   strings.TrimSpace(in.Body.Description),
			Readme:        in.Body.Readme,
			RepositoryURL: strings.TrimSpace(in.Body.RepositoryURL),
		})
		if err != nil {
			return nil, projectErr(err, "could not create project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-project",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects/{project}",
		Summary:     "Get a project",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *GetProjectInput) (*ProjectOutput, error) {
		actorID, _ := identity(ctx)
		project, err := store.GetProject(ctx, actorID, in.Slug, in.Project)
		if err != nil {
			return nil, projectErr(err, "could not load project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})
}

// projectErr maps project store errors to HTTP statuses.
func projectErr(err error, fallback string) error {
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrProjectNotFound):
		return huma.Error404NotFound("project not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	case errors.Is(err, db.ErrProjectSlugTaken):
		return huma.Error409Conflict("a project with that slug already exists")
	default:
		return huma.Error500InternalServerError(fallback, err)
	}
}

// ProjectsListInput lists an org's projects.
type ProjectsListInput struct {
	Slug string `path:"slug"`
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

// GetProjectInput fetches one project by slug.
type GetProjectInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
}

// ProjectsOutput is the project list.
type ProjectsOutput struct {
	Body struct {
		Projects []db.Project `json:"projects"`
	}
}

// ProjectOutput is a single project.
type ProjectOutput struct {
	Body db.Project
}
