package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/paginate"
	"github.com/flagon-io/flagon/api/internal/service"
)

// Project tools (server/projects.go).
func registerProjectTools(r *Registry, svc *service.Service) {
	type listProjectsInput struct {
		Org    string `json:"org" tool:"required"`
		Q      string `json:"q"`
		Cursor string `json:"cursor"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "list_projects",
			Description: "List the projects in an organization by its slug. Optionally filter by a search term (name or slug); pass cursor to page through results (next_cursor from a prior call).",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"q":{"type":"string","description":"Optional search term matched against project name and slug"},"cursor":{"type":"string","description":"Optional pagination cursor from a previous result's next_cursor"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:project",
		Operation: "list-projects",
		Run: run(func(ctx context.Context, tc ToolContext, in listProjectsInput) (any, error) {
			projects, next, err := svc.ListProjects(ctx, tc.actor(), in.Org,
				paginate.Query{Q: in.Q, Cursor: in.Cursor, Limit: paginate.MaxLimit})
			if err != nil {
				return nil, err
			}
			return map[string]any{"projects": projects, "next_cursor": next}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_deleted_projects",
			Description: "List an organization's soft-deleted projects that are still restorable (deleted in the last 30 days); each has a purge_at after which it can no longer be restored. Use restore_project to bring one back. Org owners/admins only.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"}},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:project",
		Operation: "list-deleted-projects",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			projects, _, err := svc.ListDeletedProjects(ctx, tc.actor(), in.Org, firstPage)
			if err != nil {
				return nil, err
			}
			return map[string]any{"projects": projects}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "get_project",
			Description: "Get a single project in an organization by the org slug and project slug.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "read:project",
		Operation: "get-project",
		Run: run(func(ctx context.Context, tc ToolContext, in projectArg) (any, error) {
			p, err := svc.GetProject(ctx, tc.actor(), in.Org, in.Project)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p}, nil
		}),
	})

	type createProjectInput struct {
		Org           string `json:"org" tool:"required"`
		Name          string `json:"name" tool:"required"`
		Slug          string `json:"slug"`
		Description   string `json:"description"`
		RepositoryURL string `json:"repository_url"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "create_project",
			Description: "Create a project in an organization. The slug is derived from the name if not given.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"name":{"type":"string","description":"Display name of the project"},"slug":{"type":"string","description":"Optional URL slug; lowercase letters, numbers and dashes"},"description":{"type":"string","description":"Short description"},"repository_url":{"type":"string","description":"Optional source repository URL"}},"required":["org","name"],"additionalProperties":false}`),
		},
		Scope:     "write:project",
		Operation: "create-project",
		Mutating:  true,
		Summarize: summarize(func(in createProjectInput) string {
			return fmt.Sprintf("Create project %q in %q", in.Name, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in createProjectInput) (any, error) {
			p, err := svc.CreateProject(ctx, tc.actor(), in.Org, service.CreateProjectInput{
				Name:          in.Name,
				Slug:          in.Slug,
				Description:   in.Description,
				RepositoryURL: in.RepositoryURL,
			})
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p}, nil
		}),
	})

	// Pointers so an omitted field stays unchanged (partial update).
	type updateProjectInput struct {
		Org           string  `json:"org" tool:"required"`
		Project       string  `json:"project" tool:"required"`
		Name          *string `json:"name"`
		Slug          *string `json:"slug"`
		Description   *string `json:"description"`
		Readme        *string `json:"readme"`
		RepositoryURL *string `json:"repository_url"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "update_project",
			Description: "Update a project's fields. Only the fields you provide change; omit the rest. Setting slug renames the project.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Current project slug"},"name":{"type":"string","description":"New display name"},"slug":{"type":"string","description":"New URL slug (renames the project)"},"description":{"type":"string","description":"New one-line summary"},"readme":{"type":"string","description":"New markdown README"},"repository_url":{"type":"string","description":"New source repository URL"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "write:project",
		Operation: "update-project",
		Mutating:  true,
		Summarize: summarize(func(in updateProjectInput) string {
			return fmt.Sprintf("Update project %q in %q", in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in updateProjectInput) (any, error) {
			p, err := svc.UpdateProject(ctx, tc.actor(), in.Org, in.Project, service.UpdateProjectInput{
				Name:          in.Name,
				Slug:          in.Slug,
				Description:   in.Description,
				Readme:        in.Readme,
				RepositoryURL: in.RepositoryURL,
			})
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "delete_project",
			Description: "Delete a project. This is a soft delete: the project is restorable and its slug is freed for reuse.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"Project slug"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "delete-project",
		Mutating:  true,
		Summarize: summarize(func(in projectArg) string {
			return fmt.Sprintf("Delete project %q in %q", in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in projectArg) (any, error) {
			p, err := svc.DeleteProject(ctx, tc.actor(), in.Org, in.Project)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p, "deleted": true}, nil
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "restore_project",
			Description: "Restore a soft-deleted project by its slug (projects stay restorable for 30 days after deletion; see list_deleted_projects for purge_at). If another live project has since taken that slug, pass new_slug to restore it under a different slug.",
			InputSchema: schema(`{"type":"object","properties":{"org":{"type":"string","description":"Organization slug"},"project":{"type":"string","description":"The deleted project's slug"},"new_slug":{"type":"string","description":"Optional new slug; required when the old slug is taken by a live project"}},"required":["org","project"],"additionalProperties":false}`),
		},
		Scope:     "admin:project",
		Operation: "restore-project",
		Mutating:  true,
		Summarize: summarize(func(in restoreProjectArg) string {
			if in.NewSlug != "" {
				return fmt.Sprintf("Restore project %q in %q as %q", in.Project, in.Org, in.NewSlug)
			}
			return fmt.Sprintf("Restore project %q in %q", in.Project, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in restoreProjectArg) (any, error) {
			p, err := svc.RestoreProject(ctx, tc.actor(), in.Org, in.Project, in.NewSlug)
			if err != nil {
				return nil, err
			}
			return map[string]any{"project": p, "restored": true}, nil
		}),
	})
}

// restoreProjectArg is restore_project's input: projectArg plus an optional new
// slug for when the old one was taken.
type restoreProjectArg struct {
	Org     string `json:"org"`
	Project string `json:"project"`
	NewSlug string `json:"new_slug"`
}
