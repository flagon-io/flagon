package server

import (
	"context"
	"crypto/subtle"
	"net/http"
	"regexp"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// SSO provider configuration. The API owns an org's OIDC/SAML providers: owners
// and admins manage them here (and through the agent/MCP tools, which call the
// same service). The app's auth layer runs the protocol flow from a cache it
// rebuilds from the internal read below on every SSO sign-in and callback, so a
// change made through any front door takes effect on the next sign-in.
//
// Secrets (the OIDC client secret, a SAML signing key) are write-only on the
// user-facing operations: reads report only whether each one is set.

// SSOOIDCInput is the OIDC part of a create request.
type SSOOIDCInput struct {
	ClientID          string   `json:"client_id" doc:"OAuth client ID registered with the identity provider."`
	ClientSecret      string   `json:"client_secret" doc:"OAuth client secret. Write-only: never returned."`
	DiscoveryEndpoint string   `json:"discovery_endpoint,omitempty" doc:"OpenID discovery URL; defaults to <issuer>/.well-known/openid-configuration."`
	Scopes            []string `json:"scopes,omitempty" doc:"Scopes to request; defaults to openid, email, profile."`
	PKCE              *bool    `json:"pkce,omitempty" doc:"Use PKCE for the authorization flow (default true)."`
}

// SSOSAMLInput is the SAML part of a create request.
type SSOSAMLInput struct {
	EntryPoint           string `json:"entry_point" doc:"The identity provider's single sign-on URL."`
	Cert                 string `json:"cert" doc:"The identity provider's signing certificate (PEM)."`
	Audience             string `json:"audience,omitempty" doc:"Expected audience of the assertion, when the IdP sets one."`
	WantAssertionsSigned bool   `json:"want_assertions_signed,omitempty" doc:"Require signed assertions."`
	AuthnRequestsSigned  bool   `json:"authn_requests_signed,omitempty" doc:"Sign authentication requests (needs private_key)."`
	PrivateKey           string `json:"private_key,omitempty" doc:"Service-provider signing key (PEM). Write-only: never returned."`
}

// CreateSSOProviderInput registers a provider for an org.
type CreateSSOProviderInput struct {
	Slug string `path:"slug"`
	Body struct {
		ProviderID string        `json:"provider_id" doc:"Stable identifier, part of the sign-in callback URL (lowercase letters, digits, hyphens)." example:"acme-okta"`
		Type       string        `json:"type" enum:"oidc,saml" doc:"Protocol."`
		Domain     string        `json:"domain,omitempty" doc:"Email domain routed to this provider by 'sign in with SSO'." example:"acme.com"`
		Issuer     string        `json:"issuer" doc:"OIDC: the IdP issuer URL. SAML: the service-provider entity ID."`
		OIDC       *SSOOIDCInput `json:"oidc,omitempty" doc:"OIDC settings (type oidc)."`
		SAML       *SSOSAMLInput `json:"saml,omitempty" doc:"SAML settings (type saml)."`
	}
}

// SSOOIDCPatch is the OIDC part of an update; omitted fields are unchanged.
type SSOOIDCPatch struct {
	ClientID          *string   `json:"client_id,omitempty"`
	ClientSecret      *string   `json:"client_secret,omitempty" doc:"Replace the client secret. Omit to keep the current one."`
	DiscoveryEndpoint *string   `json:"discovery_endpoint,omitempty"`
	Scopes            *[]string `json:"scopes,omitempty"`
	PKCE              *bool     `json:"pkce,omitempty"`
}

// SSOSAMLPatch is the SAML part of an update; omitted fields are unchanged.
type SSOSAMLPatch struct {
	EntryPoint           *string `json:"entry_point,omitempty"`
	Cert                 *string `json:"cert,omitempty"`
	Audience             *string `json:"audience,omitempty"`
	WantAssertionsSigned *bool   `json:"want_assertions_signed,omitempty"`
	AuthnRequestsSigned  *bool   `json:"authn_requests_signed,omitempty"`
	PrivateKey           *string `json:"private_key,omitempty" doc:"Replace the signing key (empty string removes it). Omit to keep the current one."`
}

// UpdateSSOProviderInput edits a provider. The provider ID and type are fixed.
type UpdateSSOProviderInput struct {
	Slug     string `path:"slug"`
	Provider string `path:"provider"`
	Body     struct {
		Domain *string       `json:"domain,omitempty"`
		Issuer *string       `json:"issuer,omitempty"`
		OIDC   *SSOOIDCPatch `json:"oidc,omitempty"`
		SAML   *SSOSAMLPatch `json:"saml,omitempty"`
	}
}

// SSOProviderInput addresses one provider.
type SSOProviderInput struct {
	Slug     string `path:"slug"`
	Provider string `path:"provider"`
}

// SSOProviderOutput is one provider, secrets masked.
type SSOProviderOutput struct {
	Body db.SSOProvider
}

// SSOProvidersOutput is an org's providers, secrets masked.
type SSOProvidersOutput struct {
	Body struct {
		Providers []db.SSOProvider `json:"providers"`
	}
}

// SSOProviderConfigsInput filters the internal configuration read.
type SSOProviderConfigsInput struct {
	ProviderID string `query:"provider_id" doc:"Exact provider ID."`
	Domain     string `query:"domain" doc:"An email domain; matches providers whose domain equals it or is a parent of it."`
	OrgID      string `query:"org_id" doc:"Flagon organization id."`
}

// SSOProviderConfigsOutput is the full configuration, secrets included (internal).
type SSOProviderConfigsOutput struct {
	Body struct {
		Providers []db.SSOProviderConfig `json:"providers"`
	}
}

// ImportSSOProviderInput adopts a provider that predates API ownership.
type ImportSSOProviderInput struct {
	Body struct {
		OrgID      string        `json:"org_id" doc:"Flagon organization id the provider is bound to."`
		UserID     string        `json:"user_id,omitempty" doc:"User who originally registered it (recorded as its creator when known)."`
		ProviderID string        `json:"provider_id"`
		Type       string        `json:"type" enum:"oidc,saml"`
		Domain     string        `json:"domain,omitempty"`
		Issuer     string        `json:"issuer"`
		OIDC       *SSOOIDCInput `json:"oidc,omitempty"`
		SAML       *SSOSAMLInput `json:"saml,omitempty"`
	}
}

// ImportSSOProviderOutput reports what the import did and, when the provider is
// live, its authoritative configuration.
type ImportSSOProviderOutput struct {
	Body struct {
		Outcome  string                `json:"outcome" enum:"imported,exists,deleted,no_org" doc:"imported: adopted now; exists: already owned by the API; deleted: removed on purpose, do not use; no_org: the org is gone."`
		Provider *db.SSOProviderConfig `json:"provider,omitempty"`
	}
}

// registerSSOProvidersAPI wires the user-facing SSO provider operations and the
// app-only internal read/import the auth layer's cache runs on.
func registerSSOProvidersAPI(api huma.API, d deps, internalToken string) {
	huma.Register(api, huma.Operation{
		OperationID: "list-sso-providers",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/sso/providers",
		Summary:     "List an organization's SSO providers",
		Description: "Owners/admins only. Secrets are never returned; each provider reports whether its secret is set.",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *struct {
		Slug string `path:"slug"`
	}) (*SSOProvidersOutput, error) {
		ps, err := d.svc.ListSSOProviders(ctx, actor(ctx), in.Slug)
		if err != nil {
			return nil, apiErr(err, "could not list SSO providers")
		}
		out := &SSOProvidersOutput{}
		out.Body.Providers = ps
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "get-sso-provider",
		Method:      http.MethodGet,
		Path:        "/orgs/{slug}/sso/providers/{provider}",
		Summary:     "Get an SSO provider",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *SSOProviderInput) (*SSOProviderOutput, error) {
		p, err := d.svc.GetSSOProvider(ctx, actor(ctx), in.Slug, in.Provider)
		if err != nil {
			return nil, apiErr(err, "could not read the SSO provider")
		}
		return &SSOProviderOutput{Body: p}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID:   "create-sso-provider",
		Method:        http.MethodPost,
		Path:          "/orgs/{slug}/sso/providers",
		Summary:       "Add an SSO provider",
		Description:   "Registers an OIDC or SAML identity provider for the org. Owners/admins only; audited.",
		DefaultStatus: http.StatusCreated,
		Middlewares:   huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *CreateSSOProviderInput) (*SSOProviderOutput, error) {
		p, err := d.svc.CreateSSOProvider(ctx, actor(ctx), in.Slug, ssoCreateFromBody(
			in.Body.ProviderID, in.Body.Type, in.Body.Domain, in.Body.Issuer, in.Body.OIDC, in.Body.SAML))
		if err != nil {
			return nil, apiErr(err, "could not add the SSO provider")
		}
		return &SSOProviderOutput{Body: p}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "update-sso-provider",
		Method:      http.MethodPatch,
		Path:        "/orgs/{slug}/sso/providers/{provider}",
		Summary:     "Update an SSO provider",
		Description: "Partial update; omitted fields (including secrets) are unchanged. Owners/admins only; audited.",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *UpdateSSOProviderInput) (*SSOProviderOutput, error) {
		patch := service.SSOProviderPatch{Domain: in.Body.Domain, Issuer: in.Body.Issuer}
		if o := in.Body.OIDC; o != nil {
			patch.ClientID, patch.ClientSecret, patch.DiscoveryEndpoint, patch.Scopes, patch.PKCE =
				o.ClientID, o.ClientSecret, o.DiscoveryEndpoint, o.Scopes, o.PKCE
		}
		if s := in.Body.SAML; s != nil {
			patch.EntryPoint, patch.Cert, patch.Audience = s.EntryPoint, s.Cert, s.Audience
			patch.WantAssertionsSigned, patch.AuthnRequestsSigned, patch.PrivateKey =
				s.WantAssertionsSigned, s.AuthnRequestsSigned, s.PrivateKey
		}
		p, err := d.svc.UpdateSSOProvider(ctx, actor(ctx), in.Slug, in.Provider, patch)
		if err != nil {
			return nil, apiErr(err, "could not update the SSO provider")
		}
		return &SSOProviderOutput{Body: p}, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "delete-sso-provider",
		Method:      http.MethodDelete,
		Path:        "/orgs/{slug}/sso/providers/{provider}",
		Summary:     "Remove an SSO provider",
		Description: "Sign-in through the provider stops at the next attempt. Owners/admins only; audited.",
		Middlewares: huma.Middlewares{d.auth},
	}, func(ctx context.Context, in *SSOProviderInput) (*OKOutput, error) {
		if err := d.svc.DeleteSSOProvider(ctx, actor(ctx), in.Slug, in.Provider); err != nil {
			return nil, apiErr(err, "could not remove the SSO provider")
		}
		return okOutput(), nil
	})

	// --- app-only (internal token, no user: the sign-in has not happened yet) ---

	system := internalSystemAuth(api, internalToken)

	huma.Register(api, huma.Operation{
		OperationID: "get-sso-provider-configs",
		Method:      http.MethodGet,
		Path:        "/internal/sso/providers",
		Summary:     "Read full SSO provider configuration for the auth layer (internal)",
		Middlewares: huma.Middlewares{system},
	}, func(ctx context.Context, in *SSOProviderConfigsInput) (*SSOProviderConfigsOutput, error) {
		f := db.SSOConfigFilter{
			ProviderID: strings.TrimSpace(in.ProviderID),
			Domain:     strings.ToLower(strings.TrimSpace(in.Domain)),
			OrgID:      strings.TrimSpace(in.OrgID),
		}
		if f.ProviderID == "" && f.Domain == "" && f.OrgID == "" {
			return nil, huma.Error422UnprocessableEntity("provider_id, domain or org_id is required")
		}
		if f.OrgID != "" {
			if !ssoUUIDPattern.MatchString(f.OrgID) {
				return nil, huma.Error422UnprocessableEntity("org_id must be an organization id")
			}
		}
		ps, err := d.store.SSOProviderConfigs(ctx, f)
		if err != nil {
			return nil, apiErr(err, "could not read SSO provider configuration")
		}
		out := &SSOProviderConfigsOutput{}
		out.Body.Providers = ps
		return out, nil
	})

	huma.Register(api, huma.Operation{
		OperationID: "import-sso-provider",
		Method:      http.MethodPost,
		Path:        "/internal/sso/providers/import",
		Summary:     "Adopt an SSO provider registered before the API owned them (internal)",
		Middlewares: huma.Middlewares{system},
	}, func(ctx context.Context, in *ImportSSOProviderInput) (*ImportSSOProviderOutput, error) {
		b := in.Body
		providerID := strings.TrimSpace(b.ProviderID)
		typ := strings.ToLower(strings.TrimSpace(b.Type))
		if providerID == "" || (typ != db.SSOTypeOIDC && typ != db.SSOTypeSAML) {
			return nil, huma.Error422UnprocessableEntity("provider_id and a type of oidc or saml are required")
		}
		if !ssoUUIDPattern.MatchString(strings.TrimSpace(b.OrgID)) {
			return nil, huma.Error422UnprocessableEntity("org_id must be an organization id")
		}
		// Adoption is deliberately lenient: the provider already works in
		// production, and rejecting it on a stricter rule would break sign-in.
		c := ssoCreateFromBody(providerID, typ, b.Domain, b.Issuer, b.OIDC, b.SAML)
		input := db.SSOProviderInput{
			ProviderID: providerID,
			Type:       typ,
			Domain:     strings.ToLower(strings.TrimSpace(c.Domain)),
			Issuer:     strings.TrimSpace(c.Issuer),
		}
		if typ == db.SSOTypeOIDC {
			pkce := true
			if c.PKCE != nil {
				pkce = *c.PKCE
			}
			input.OIDC = &db.SSOOIDCConfig{ClientID: c.ClientID, DiscoveryEndpoint: c.DiscoveryEndpoint, Scopes: c.Scopes, PKCE: pkce}
			input.Secrets.ClientSecret = c.ClientSecret
		} else {
			input.SAML = &db.SSOSAMLConfig{EntryPoint: c.EntryPoint, Cert: c.Cert, Audience: c.Audience,
				WantAssertionsSigned: c.WantAssertionsSigned, AuthnRequestsSigned: c.AuthnRequestsSigned}
			input.Secrets.PrivateKey = c.PrivateKey
		}
		outcome, err := d.store.ImportSSOProvider(ctx, strings.TrimSpace(b.OrgID), strings.TrimSpace(b.UserID), input)
		if err != nil {
			return nil, apiErr(err, "could not import the SSO provider")
		}
		out := &ImportSSOProviderOutput{}
		out.Body.Outcome = outcome
		if outcome == db.SSOImportImported || outcome == db.SSOImportExists {
			ps, err := d.store.SSOProviderConfigs(ctx, db.SSOConfigFilter{ProviderID: providerID})
			if err != nil {
				return nil, apiErr(err, "could not read SSO provider configuration")
			}
			if len(ps) > 0 {
				out.Body.Provider = &ps[0]
			}
		}
		return out, nil
	})
}

// ssoUUIDPattern is an org id (a Postgres uuid), checked before it reaches a query.
var ssoUUIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ssoCreateFromBody flattens the nested REST body into the service's request.
func ssoCreateFromBody(providerID, typ, domain, issuer string, o *SSOOIDCInput, s *SSOSAMLInput) service.SSOProviderCreate {
	c := service.SSOProviderCreate{ProviderID: providerID, Type: typ, Domain: domain, Issuer: issuer}
	if o != nil {
		c.ClientID, c.ClientSecret, c.DiscoveryEndpoint, c.Scopes, c.PKCE =
			o.ClientID, o.ClientSecret, o.DiscoveryEndpoint, o.Scopes, o.PKCE
	}
	if s != nil {
		c.EntryPoint, c.Cert, c.Audience = s.EntryPoint, s.Cert, s.Audience
		c.WantAssertionsSigned, c.AuthnRequestsSigned, c.PrivateKey = s.WantAssertionsSigned, s.AuthnRequestsSigned, s.PrivateKey
	}
	return c
}

// internalSystemAuth accepts ONLY the internal app<->API token and, unlike
// internalAuth, needs no forwarded user: it gates the auth layer's reads that
// happen before anyone is signed in. Never token-reachable.
func internalSystemAuth(api huma.API, token string) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		if token == "" {
			_ = huma.WriteErr(api, ctx, http.StatusServiceUnavailable, "identity API is not configured")
			return
		}
		presented := strings.TrimPrefix(ctx.Header("Authorization"), "Bearer ")
		if subtle.ConstantTimeCompare([]byte(presented), []byte(token)) != 1 {
			_ = huma.WriteErr(api, ctx, http.StatusUnauthorized, "invalid internal token")
			return
		}
		next(withAuditMeta(ctx, true))
	}
}
