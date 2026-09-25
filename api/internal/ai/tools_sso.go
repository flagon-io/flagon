package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/flagon-io/flagon/api/internal/service"
)

// SSO provider tools (server/sso_providers.go). Reads return the service's
// masked shape (a secret is only ever reported as set or not). Secrets can be
// supplied on create/update, are write-only, and never appear in a result or in
// a confirmation summary.
func registerSSOProviderTools(r *Registry, svc *service.Service) {
	const orgProp = `"org":{"type":"string","description":"Organization slug"}`
	const providerProp = `"provider_id":{"type":"string","description":"The SSO provider's ID (e.g. acme-okta)"}`
	const settingsProps = `"domain":{"type":"string","description":"Email domain routed to this provider by 'sign in with SSO' (e.g. acme.com)"},` +
		`"issuer":{"type":"string","description":"OIDC: the IdP issuer URL. SAML: the service-provider entity ID"},` +
		`"client_id":{"type":"string","description":"OIDC client ID"},` +
		`"client_secret":{"type":"string","description":"OIDC client secret (write-only; never returned)"},` +
		`"discovery_endpoint":{"type":"string","description":"OIDC discovery URL (defaults to <issuer>/.well-known/openid-configuration)"},` +
		`"scopes":{"type":"array","items":{"type":"string"},"description":"OIDC scopes to request"},` +
		`"pkce":{"type":"boolean","description":"OIDC: use PKCE (default true)"},` +
		`"entry_point":{"type":"string","description":"SAML: the IdP single sign-on URL"},` +
		`"cert":{"type":"string","description":"SAML: the IdP signing certificate (PEM)"},` +
		`"audience":{"type":"string","description":"SAML: expected assertion audience"},` +
		`"want_assertions_signed":{"type":"boolean","description":"SAML: require signed assertions"},` +
		`"authn_requests_signed":{"type":"boolean","description":"SAML: sign authentication requests (needs private_key)"},` +
		`"private_key":{"type":"string","description":"SAML service-provider signing key, PEM (write-only; never returned)"}`

	r.add(Tool{
		Def: ToolDef{
			Name:        "list_sso_providers",
			Description: "List an organization's single sign-on (OIDC/SAML) providers. Org owners/admins only. Secrets are never returned; each provider says whether its secret is set.",
			InputSchema: schema(`{"type":"object","properties":{` + orgProp + `},"required":["org"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "list-sso-providers",
		Run: run(func(ctx context.Context, tc ToolContext, in orgArg) (any, error) {
			ps, err := svc.ListSSOProviders(ctx, tc.actor(), in.Org)
			if err != nil {
				return nil, err
			}
			return map[string]any{"providers": ps}, nil
		}),
	})

	type providerArg struct {
		Org        string `json:"org" tool:"required"`
		ProviderID string `json:"provider_id" tool:"required"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "get_sso_provider",
			Description: "Get one of an organization's SSO providers by its provider ID. Org owners/admins only. Secrets are never returned.",
			InputSchema: schema(`{"type":"object","properties":{` + orgProp + `,` + providerProp + `},"required":["org","provider_id"],"additionalProperties":false}`),
		},
		Scope:     "read:org",
		Operation: "get-sso-provider",
		Run: run(func(ctx context.Context, tc ToolContext, in providerArg) (any, error) {
			return svc.GetSSOProvider(ctx, tc.actor(), in.Org, in.ProviderID)
		}),
	})

	type createInput struct {
		Org                  string   `json:"org" tool:"required"`
		ProviderID           string   `json:"provider_id" tool:"required"`
		Type                 string   `json:"type" tool:"required"`
		Domain               string   `json:"domain"`
		Issuer               string   `json:"issuer" tool:"required"`
		ClientID             string   `json:"client_id"`
		ClientSecret         string   `json:"client_secret"`
		DiscoveryEndpoint    string   `json:"discovery_endpoint"`
		Scopes               []string `json:"scopes"`
		PKCE                 *bool    `json:"pkce"`
		EntryPoint           string   `json:"entry_point"`
		Cert                 string   `json:"cert"`
		Audience             string   `json:"audience"`
		WantAssertionsSigned bool     `json:"want_assertions_signed"`
		AuthnRequestsSigned  bool     `json:"authn_requests_signed"`
		PrivateKey           string   `json:"private_key"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name: "create_sso_provider",
			Description: "Add a single sign-on provider to an organization. type is oidc (needs issuer URL, client_id, client_secret) or saml (needs issuer = SP entity ID, entry_point, cert). " +
				"provider_id is a lowercase slug that becomes part of the sign-in callback URL. Org owners/admins only; audited. Secrets are write-only.",
			InputSchema: schema(`{"type":"object","properties":{` + orgProp + `,` + providerProp + `,"type":{"type":"string","enum":["oidc","saml"],"description":"Protocol"},` + settingsProps + `},"required":["org","provider_id","type","issuer"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "create-sso-provider",
		Mutating:  true,
		Summarize: summarize(func(in createInput) string {
			return fmt.Sprintf("Add %s single sign-on provider %q to %q", strings.ToUpper(in.Type), in.ProviderID, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in createInput) (any, error) {
			return svc.CreateSSOProvider(ctx, tc.actor(), in.Org, service.SSOProviderCreate{
				ProviderID: in.ProviderID, Type: in.Type, Domain: in.Domain, Issuer: in.Issuer,
				ClientID: in.ClientID, ClientSecret: in.ClientSecret, DiscoveryEndpoint: in.DiscoveryEndpoint,
				Scopes: in.Scopes, PKCE: in.PKCE,
				EntryPoint: in.EntryPoint, Cert: in.Cert, Audience: in.Audience,
				WantAssertionsSigned: in.WantAssertionsSigned, AuthnRequestsSigned: in.AuthnRequestsSigned,
				PrivateKey: in.PrivateKey,
			})
		}),
	})

	// Pointers so an omitted field is left unchanged (partial update).
	type updateInput struct {
		Org                  string    `json:"org" tool:"required"`
		ProviderID           string    `json:"provider_id" tool:"required"`
		Domain               *string   `json:"domain"`
		Issuer               *string   `json:"issuer"`
		ClientID             *string   `json:"client_id"`
		ClientSecret         *string   `json:"client_secret"`
		DiscoveryEndpoint    *string   `json:"discovery_endpoint"`
		Scopes               *[]string `json:"scopes"`
		PKCE                 *bool     `json:"pkce"`
		EntryPoint           *string   `json:"entry_point"`
		Cert                 *string   `json:"cert"`
		Audience             *string   `json:"audience"`
		WantAssertionsSigned *bool     `json:"want_assertions_signed"`
		AuthnRequestsSigned  *bool     `json:"authn_requests_signed"`
		PrivateKey           *string   `json:"private_key"`
	}
	r.add(Tool{
		Def: ToolDef{
			Name:        "update_sso_provider",
			Description: "Update an organization's SSO provider. Only the fields you provide change; the provider ID and type are fixed. Omit a secret to keep the current one. Org owners/admins only; audited.",
			InputSchema: schema(`{"type":"object","properties":{` + orgProp + `,` + providerProp + `,` + settingsProps + `},"required":["org","provider_id"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "update-sso-provider",
		Mutating:  true,
		Summarize: summarize(func(in updateInput) string {
			s := fmt.Sprintf("Update single sign-on provider %q in %q", in.ProviderID, in.Org)
			if in.ClientSecret != nil || in.PrivateKey != nil {
				s += " (replacing its credentials)"
			}
			return s
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in updateInput) (any, error) {
			return svc.UpdateSSOProvider(ctx, tc.actor(), in.Org, in.ProviderID, service.SSOProviderPatch{
				Domain: in.Domain, Issuer: in.Issuer,
				ClientID: in.ClientID, ClientSecret: in.ClientSecret, DiscoveryEndpoint: in.DiscoveryEndpoint,
				Scopes: in.Scopes, PKCE: in.PKCE,
				EntryPoint: in.EntryPoint, Cert: in.Cert, Audience: in.Audience,
				WantAssertionsSigned: in.WantAssertionsSigned, AuthnRequestsSigned: in.AuthnRequestsSigned,
				PrivateKey: in.PrivateKey,
			})
		}),
	})

	r.add(Tool{
		Def: ToolDef{
			Name:        "delete_sso_provider",
			Description: "Remove an SSO provider from an organization. Sign-in through it stops at the next attempt. Org owners/admins only; audited.",
			InputSchema: schema(`{"type":"object","properties":{` + orgProp + `,` + providerProp + `},"required":["org","provider_id"],"additionalProperties":false}`),
		},
		Scope:     "write:org",
		Operation: "delete-sso-provider",
		Mutating:  true,
		Summarize: summarize(func(in providerArg) string {
			return fmt.Sprintf("Remove single sign-on provider %q from %q", in.ProviderID, in.Org)
		}),
		Run: run(func(ctx context.Context, tc ToolContext, in providerArg) (any, error) {
			if err := svc.DeleteSSOProvider(ctx, tc.actor(), in.Org, in.ProviderID); err != nil {
				return nil, err
			}
			return map[string]any{"deleted": in.ProviderID}, nil
		}),
	})
}
