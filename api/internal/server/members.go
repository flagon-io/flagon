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

// registerMembersAPI wires org member management (the RBAC baseline). Gated by
// the internal token + forwarded user; the store enforces the role hierarchy and
// last-owner protection.
func registerMembersAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	// list-members is paginated: a documented GET plus a Hidden QUERY twin sharing
	// one fetch. See listing.go.
	listMembers := func(ctx context.Context, slug string, q paginate.Query) (*MembersOutput, error) {
		actorID, _ := identity(ctx)
		members, next, err := store.ListMembers(ctx, actorID, slug, q)
		if err != nil {
			return nil, memberErr(err, "could not list members")
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
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *MembersInput) (*MembersOutput, error) {
		return listMembers(ctx, in.Slug, in.ListQuery())
	})
	registerQueryList(api, auth, "query-members", "/orgs/{slug}/members",
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
		Middlewares:   huma.Middlewares{auth},
	}, func(ctx context.Context, in *AddMemberInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		role := in.Body.Role
		if role == "" {
			role = db.RoleMember
		}
		targetID, orgName, err := store.AddMember(ctx, actorID, in.Slug, strings.TrimSpace(in.Body.Login), role)
		if err != nil {
			return nil, memberErr(err, "could not add member")
		}
		// Welcome the new member (best-effort).
		_ = store.CreateNotification(ctx, targetID, nil, "org.member_added",
			"You were added to "+orgName, "You now have access to "+orgName+".", "/"+in.Slug)
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-member-role",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/members/{userId}/role",
		Summary:     "Change a member's role",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *SetRoleInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.SetMemberRole(ctx, actorID, in.Slug, in.UserID, in.Body.Role); err != nil {
			return nil, memberErr(err, "could not change role")
		}
		// Tell the member their role changed (best-effort).
		_ = store.CreateNotification(ctx, in.UserID, nil, "org.role_changed",
			"Your role changed", "Your role in this organization is now "+in.Body.Role+".", "/"+in.Slug)
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "remove-member",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/members/{userId}",
		Summary:     "Remove a member from an organization",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *RemoveMemberInput) (*OKOutput, error) {
		actorID, _ := identity(ctx)
		if err := store.RemoveMember(ctx, actorID, in.Slug, in.UserID); err != nil {
			return nil, memberErr(err, "could not remove member")
		}
		// Let the removed member know (best-effort). No org link - they lost access.
		_ = store.CreateNotification(ctx, in.UserID, nil, "org.member_removed",
			"You were removed from an organization", "You no longer have access to it.", "")
		out := &OKOutput{}
		out.Body.OK = true
		return out, nil
	})
}

// memberErr maps the store's member-management errors to HTTP statuses.
func memberErr(err error, fallback string) error {
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you don't have permission to do that")
	case errors.Is(err, db.ErrSelfManage):
		return huma.Error409Conflict("you can't change your own membership here; use Leave instead")
	case errors.Is(err, db.ErrUserNotFound):
		return huma.Error404NotFound("no user with that email or username")
	case errors.Is(err, db.ErrAlreadyMember):
		return huma.Error409Conflict("that user is already a member")
	case errors.Is(err, db.ErrTargetNotMember):
		return huma.Error404NotFound("that user is not a member")
	case errors.Is(err, db.ErrLastOwner):
		return huma.Error409Conflict("an organization must always have an owner")
	case errors.Is(err, db.ErrInvalidRole):
		return huma.Error422UnprocessableEntity("invalid role")
	default:
		return huma.Error500InternalServerError(fallback, err)
	}
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
