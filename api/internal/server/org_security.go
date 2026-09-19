package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
)

// OrgSecurityOutput is the org security + member-access policy read/write shape.
type OrgSecurityOutput struct {
	Body struct {
		EnforceTwoFactor bool   `json:"enforce_two_factor" doc:"Whether members must have two-factor authentication enabled to access the org."`
		RequireSSO       bool   `json:"require_sso" doc:"Whether members must sign in through the org's SSO provider."`
		BasePermission   string `json:"base_permission" doc:"Default project access for members (none|read|triage|write|maintain|admin), raised by explicit grants." enum:"none,read,triage,write,maintain,admin"`
	}
}

// OrgSecurityInput sets the org security policy.
type OrgSecurityInput struct {
	Slug string `path:"slug"`
	Body struct {
		EnforceTwoFactor bool   `json:"enforce_two_factor"`
		RequireSSO       bool   `json:"require_sso"`
		BasePermission   string `json:"base_permission" enum:"none,read,triage,write,maintain,admin"`
	}
}

// registerOrgSecurityAPI wires an org's security policy (owners/admins only). The
// app gate enforces the policy; this is where owners configure it. The 2FA
// mechanism lives in the app's auth layer, so this stores the requirement only.
func registerOrgSecurityAPI(api huma.API, store IdentityStore, internalToken string) {
	auth := combinedAuth(api, store, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "get-org-security",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/security",
		Summary:     "Get an organization's security policy",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *struct {
		Slug string `path:"slug"`
	}) (*OrgSecurityOutput, error) {
		actorID, _ := identity(ctx)
		s, err := store.GetOrgSecurity(ctx, actorID, in.Slug)
		if err != nil {
			return nil, orgSecurityErr(err)
		}
		out := &OrgSecurityOutput{}
		out.Body.EnforceTwoFactor = s.EnforceTwoFactor
		out.Body.RequireSSO = s.RequireSSO
		out.Body.BasePermission = s.BasePermission
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "set-org-security",
		Method:      http.MethodPut,
		Path:        "/orgs/{slug}/security",
		Summary:     "Update an organization's security policy",
		Middlewares: huma.Middlewares{auth},
	}, func(ctx context.Context, in *OrgSecurityInput) (*OrgSecurityOutput, error) {
		actorID, _ := identity(ctx)
		s := db.OrgSecurity{
			EnforceTwoFactor: in.Body.EnforceTwoFactor,
			RequireSSO:       in.Body.RequireSSO,
			BasePermission:   in.Body.BasePermission,
		}
		if err := store.SetOrgSecurity(ctx, actorID, in.Slug, s); err != nil {
			return nil, orgSecurityErr(err)
		}
		out := &OrgSecurityOutput{}
		out.Body.EnforceTwoFactor = s.EnforceTwoFactor
		out.Body.RequireSSO = s.RequireSSO
		out.Body.BasePermission = s.BasePermission
		return out, nil
	})
}

func orgSecurityErr(err error) error {
	switch {
	case errors.Is(err, db.ErrNotMember):
		return huma.Error404NotFound("organization not found")
	case errors.Is(err, db.ErrForbidden):
		return huma.Error403Forbidden("you do not have permission to manage this organization's security")
	case errors.Is(err, db.ErrInvalidBasePermission):
		return huma.Error422UnprocessableEntity("invalid base permission")
	default:
		return huma.Error500InternalServerError("could not read or update the organization's security policy", err)
	}
}
