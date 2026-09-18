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
	}, func(ctx context.Context, in *GetProjectInput) (*ProjectDetailOutput, error) {
		actorID, _ := identity(ctx)
		project, err := store.GetProject(ctx, actorID, in.Slug, in.Project)
		if err != nil {
			return nil, projectErr(err, "could not load project")
		}
		out := &ProjectDetailOutput{}
		out.Body.Project = project

		// Stripe-style expand[]: inline related objects on request. By default the
		// project carries only org_id; expand[]=organization embeds the org.
		expand := parseExpand(in.Expand)
		if expand.Has("organization") {
			org, err := store.GetOrg(ctx, actorID, in.Slug)
			if err != nil {
				return nil, projectErr(err, "could not expand organization")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *UpdateProjectInput) (*ProjectOutput, error) {
		actorID, _ := identity(ctx)
		update := db.ProjectUpdate{
			Description:   in.Body.Description,
			Readme:        in.Body.Readme,
			RepositoryURL: in.Body.RepositoryURL,
		}
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
		project, err := store.UpdateProject(ctx, actorID, in.Slug, in.Project, update)
		if err != nil {
			return nil, projectErr(err, "could not update project")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *GetProjectInput) (*ProjectOutput, error) {
		actorID, _ := identity(ctx)
		project, err := store.SetProjectDeleted(ctx, actorID, in.Slug, in.Project, true)
		if err != nil {
			return nil, projectErr(err, "could not delete project")
		}
		out := &ProjectOutput{}
		out.Body = project
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "restore-project",
		Method:      http.MethodPost,
		Path:        "/orgs/{slug}/projects/{project}/restore",
		Summary:     "Restore a soft-deleted project",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *GetProjectInput) (*ProjectOutput, error) {
		actorID, _ := identity(ctx)
		project, err := store.SetProjectDeleted(ctx, actorID, in.Slug, in.Project, false)
		if err != nil {
			return nil, projectErr(err, "could not restore project")
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

// GetProjectInput fetches one project by slug (also used by delete + restore).
// Expand accepts Stripe-style expand[] params (e.g. expand[]=organization).
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
