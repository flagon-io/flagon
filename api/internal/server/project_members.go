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

// registerProjectMembersAPI wires per-project RBAC (repo-style collaborator
// grants). The store enforces the effective-role rule (max of org role and the
// explicit grant); managing grants requires effective project admin.
func registerProjectMembersAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	// list-project-members is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listProjectMembers := func(ctx context.Context, slug, project string, q paginate.Query) (*ProjectMembersOutput, error) {
		actorID, _ := identity(ctx)
		members, next, err := store.ListProjectMembers(ctx, actorID, slug, project, q)
		if err != nil {
			return nil, projectMemberErr(err, "could not list collaborators")
		}
		out := &ProjectMembersOutput{}
		out.Body.Members = members
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/projects/"+project+"/members", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-project-members",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/projects/{project}/members",
		Summary:     "List a project's collaborators",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *ProjectMembersInput) (*ProjectMembersOutput, error) {
		return listProjectMembers(ctx, in.Slug, in.Project, in.ListQuery())
	})
	registerQueryList(api, auth, "query-project-members", "/orgs/{slug}/projects/{project}/members",
		"List a project's collaborators (QUERY)",
		func(ctx context.Context, in *ProjectMembersQueryInput) (*ProjectMembersOutput, error) {
			return listProjectMembers(ctx, in.Slug, in.Project, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "add-project-member",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/projects/{project}/members",
		Summary:       "Grant an org member a role on a project",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *AddProjectMemberInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		targetID, err := store.AddProjectMember(ctx, actorID, in.Slug, in.Project,
			strings.TrimSpace(in.Body.Login), in.Body.Role)
		if err != nil {
			return nil, projectMemberErr(err, "could not add collaborator")
		}
		_ = store.CreateNotification(ctx, targetID, nil, "project.access_granted",
			"You were added to a project",
			"You now have "+in.Body.Role+" access to "+in.Project+".",
			"/"+in.Slug+"/projects/"+in.Project)
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-project-member-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/projects/{project}/members/{userId}/role",
		Summary:     "Change a collaborator's project role",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *SetProjectMemberRoleInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.SetProjectMemberRole(ctx, actorID, in.Slug, in.Project, in.UserID, in.Body.Role); err != nil {
			return nil, projectMemberErr(err, "could not change role")
		}
		_ = store.CreateNotification(ctx, in.UserID, nil, "project.access_changed",
			"Your project role changed",
			"Your role on "+in.Project+" is now "+in.Body.Role+".",
			"/"+in.Slug+"/projects/"+in.Project)
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-member",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}/members/{userId}",
		Summary:     "Revoke a collaborator's project role",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *RemoveProjectMemberInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RemoveProjectMember(ctx, actorID, in.Slug, in.Project, in.UserID); err != nil {
			return nil, projectMemberErr(err, "could not remove collaborator")
		}
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})
}

// projectMemberErr maps collaborator-management errors to HTTP statuses.
func projectMemberErr(err error, fallback string) error {
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrProjectNotFound):
		return huma.Error404NotFound("project not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	case errors.Is(err, db.ErrSelfManage):
		return huma.Error409Conflict("you can't change your own access here")
	case errors.Is(err, db.ErrUserNotFound):
		return huma.Error404NotFound("no user with that email or username")
	case errors.Is(err, db.ErrTargetNotMember):
		return huma.Error409Conflict("that user must be an organization member first")
	case errors.Is(err, db.ErrAlreadyCollaborator):
		return huma.Error409Conflict("that user already has a role on this project")
	case errors.Is(err, db.ErrNotCollaborator):
		return huma.Error404NotFound("that user has no role on this project")
	case errors.Is(err, db.ErrInvalidRole):
		return huma.Error422UnprocessableEntity("invalid role")
	default:
		return huma.Error500InternalServerError(fallback, err)
	}
}

// ProjectMembersInput lists a project's collaborators (GET; search + keyset via
// ListParams).
type ProjectMembersInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	ListParams
}

// ProjectMembersQueryInput is the HTTP QUERY twin of ProjectMembersInput: the
// same list query carried in a JSON body.
type ProjectMembersQueryInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Body    ListBody
}

// ProjectMembersOutput is the collaborator list. Link carries the RFC 5988
// next-page header.
type ProjectMembersOutput struct {
	Link string `header:"Link"`
	Body struct {
		Members []db.ProjectMember `json:"members"`
	}
}

// AddProjectMemberInput grants an existing org member a project role.
type AddProjectMemberInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	Body    struct {
		Login string `json:"login" doc:"Email or username of an existing org member"`
		Role  string `json:"role" enum:"read,triage,write,maintain,admin" doc:"Repository-style role to grant"`
	}
}

// SetProjectMemberRoleInput changes a collaborator's role.
type SetProjectMemberRoleInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	UserID  string `path:"userId"`
	Body    struct {
		Role string `json:"role" enum:"read,triage,write,maintain,admin"`
	}
}

// RemoveProjectMemberInput revokes a collaborator's grant.
type RemoveProjectMemberInput struct {
	Slug    string `path:"slug"`
	Project string `path:"project"`
	UserID  string `path:"userId"`
}
