package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// registerProjectMembersAPI wires per-project RBAC (repo-style collaborator
// grants). The store enforces the effective-role rule (max of org role and the
// explicit grant); managing grants requires effective project admin.
func registerProjectMembersAPI(api huma.API, d deps) {
	// list-project-members is paginated: a documented GET plus a Hidden QUERY twin
	// sharing one fetch. See listing.go.
	listProjectMembers := func(ctx context.Context, slug, project string, q paginate.Query) (*ProjectMembersOutput, error) {
		members, next, err := d.svc.ListProjectMembers(ctx, actor(ctx), slug, project, q)
		if err != nil {
			return nil, apiErr(err, "could not list collaborators")
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
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *ProjectMembersInput) (*ProjectMembersOutput, error) {
		return listProjectMembers(ctx, in.Slug, in.Project, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-project-members", "/orgs/{slug}/projects/{project}/members",
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
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AddProjectMemberInput) (*OKOutput, error) {
		if _, err := d.svc.AddProjectMember(ctx, actor(ctx), in.Slug, in.Project, in.Body.Login, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not add collaborator")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-project-member-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/projects/{project}/members/{userId}/role",
		Summary:     "Change a collaborator's project role",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *SetProjectMemberRoleInput) (*OKOutput, error) {
		if err := d.svc.SetProjectMemberRole(ctx, actor(ctx), in.Slug, in.Project, in.UserID, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not change role")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-project-member",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/projects/{project}/members/{userId}",
		Summary:     "Revoke a collaborator's project role",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RemoveProjectMemberInput) (*OKOutput, error) {
		if err := d.svc.RemoveProjectMember(ctx, actor(ctx), in.Slug, in.Project, in.UserID); err != nil {
			return nil, apiErr(err, "could not remove collaborator")
		}
		return okOutput(), nil
	})
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
