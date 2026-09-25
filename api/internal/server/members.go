package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// registerMembersAPI wires org member management (the RBAC baseline). The
// service validates and notifies; the store enforces the role hierarchy and
// last-owner protection.
func registerMembersAPI(api huma.API, d deps) {
	// list-members is paginated: a documented GET plus a Hidden QUERY twin sharing
	// one fetch. See listing.go.
	listMembers := func(ctx context.Context, slug string, q paginate.Query) (*MembersOutput, error) {
		members, next, err := d.svc.ListMembers(ctx, actor(ctx), slug, q)
		if err != nil {
			return nil, apiErr(err, "could not list members")
		}
		out := &MembersOutput{}
		out.Body.Members = members
		out.Link = paginate.LinkHeader("/orgs/"+slug+"/members", q, next)
		return out, nil
	}
	huma.Register(api, huma.Operation{
		OperationID: "list-members",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/members",
		Summary:     "List an organization's members",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *MembersInput) (*MembersOutput, error) {
		return listMembers(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, d.auth, "query-members", "/orgs/{slug}/members",
		"List an organization's members (QUERY)",
		func(ctx context.Context, in *MembersQueryInput) (*MembersOutput, error) {
			return listMembers(ctx, in.Slug, in.Body.ListQuery())
		})

	huma.Register(api, huma.Operation{
		OperationID:   "add-member",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/members",
		Summary:       "Add an existing user to an organization",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *AddMemberInput) (*OKOutput, error) {
		if _, _, err := d.svc.AddMember(ctx, actor(ctx), in.Slug, in.Body.Login, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not add member")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-member-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/members/{userId}/role",
		Summary:     "Change a member's role",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *SetRoleInput) (*OKOutput, error) {
		if err := d.svc.SetMemberRole(ctx, actor(ctx), in.Slug, in.UserID, in.Body.Role); err != nil {
			return nil, apiErr(err, "could not change role")
		}
		return okOutput(), nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-member",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/members/{userId}",
		Summary:     "Remove a member from an organization",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *RemoveMemberInput) (*OKOutput, error) {
		if err := d.svc.RemoveMember(ctx, actor(ctx), in.Slug, in.UserID); err != nil {
			return nil, apiErr(err, "could not remove member")
		}
		return okOutput(), nil
	})
}

// MembersInput lists members of an org (GET; search + keyset via ListParams).
type MembersInput struct {
	Slug string `path:"slug"`
	ListParams
}

// MembersQueryInput is the HTTP QUERY twin of MembersInput: the same list query
// carried in a JSON body.
type MembersQueryInput struct {
	Slug string `path:"slug"`
	Body ListBody
}

// MembersOutput is the member list. Link carries the RFC 5988 next-page header.
type MembersOutput struct {
	Link string `header:"Link"`
	Body struct {
		Members []db.Member `json:"members"`
	}
}

// AddMemberInput adds an existing user by login (email or username).
type AddMemberInput struct {
	Slug string `path:"slug"`
	Body struct {
		Login string `json:"login" doc:"Email or username of an existing Flagon user"`
		Role  string `json:"role,omitempty" enum:"owner,admin,member,viewer" doc:"Role to grant (default member)"`
	}
}

// SetRoleInput changes a member's role.
type SetRoleInput struct {
	Slug   string `path:"slug"`
	UserID string `path:"userId"`
	Body   struct {
		Role string `json:"role" enum:"owner,admin,member,viewer"`
	}
}

// RemoveMemberInput removes a member.
type RemoveMemberInput struct {
	Slug   string `path:"slug"`
	UserID string `path:"userId"`
}
