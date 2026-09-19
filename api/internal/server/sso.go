package server

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
)

// ProvisionSSOInput carries an SSO-provisioned membership. The user id/email come
// from the internal identity headers (the app forwards the SSO'd user); the body
// names the org and the role to grant.
type ProvisionSSOInput struct {
	Body struct {
		OrgID string `json:"org_id" doc:"The Flagon organization id bound to the SSO provider."`
		Role  string `json:"role,omitempty" doc:"Membership role to provision (default member)."`
	}
}

// registerSSOAPI wires the internal SSO provisioning endpoint. It is never
// token-reachable: only the app calls it, across the internal-token boundary,
// AFTER BetterAuth has verified the SSO assertion for the org's provider. That
// verified org->IdP binding is what authorizes adding the user to the org.
func registerSSOAPI(api huma.API, store IdentityStore, internalToken string) {
	huma.Register(api, huma.Operation{
		OperationID: "provision-sso-member",
		Method:      http.MethodPost,
		Path:        "/internal/sso/provision-member",
		Summary:     "Provision an SSO-authenticated user into their org (internal)",
		Middlewares: huma.Middlewares{internalAuth(api, internalToken)},
	}, func(ctx context.Context, in *ProvisionSSOInput) (*SyncProfileOutput, error) {
		userID, email := identity(ctx)
		if err := store.ProvisionSSOMember(ctx, in.Body.OrgID, userID, email, in.Body.Role); err != nil {
			return nil, huma.Error500InternalServerError("could not provision SSO membership", err)
		}
		out := &SyncProfileOutput{}
		out.Body.OK = true
		return out, nil
	})
}
