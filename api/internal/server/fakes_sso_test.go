package server

import (
	"context"

	"github.com/flagon-io/flagon/api/internal/db"
)

// --- SSO providers (fakeStore) ---------------------------------------------------
//
// Benign values keyed on the inputs, or f.err. The fake OIDC provider carries a
// stored secret so tests can prove the user-facing surfaces never echo one.

const fakeSSOSecret = "fake-client-secret-never-returned"

func fakeSSOProvider(providerID string) db.SSOProvider {
	return db.SSOProvider{
		ID: "sso1", ProviderID: providerID, Type: db.SSOTypeOIDC, Domain: "acme.com",
		Issuer: "https://idp.acme.com",
		OIDC:   &db.SSOOIDCConfig{ClientID: "client-1", PKCE: true, ClientSecretSet: true},
	}
}

func (f fakeStore) ListSSOProviders(context.Context, string, string) ([]db.SSOProvider, error) {
	return []db.SSOProvider{fakeSSOProvider("acme-okta")}, f.err
}
func (f fakeStore) GetSSOProvider(_ context.Context, _, _, providerID string) (db.SSOProvider, error) {
	return fakeSSOProvider(providerID), f.err
}
func (f fakeStore) CreateSSOProvider(_ context.Context, _, _ string, in db.SSOProviderInput) (db.SSOProvider, error) {
	p := db.SSOProvider{ID: "sso1", ProviderID: in.ProviderID, Type: in.Type, Domain: in.Domain, Issuer: in.Issuer, OIDC: in.OIDC, SAML: in.SAML}
	if p.OIDC != nil {
		c := *p.OIDC
		c.ClientSecretSet = in.Secrets.ClientSecret != ""
		p.OIDC = &c
	}
	return p, f.err
}
func (f fakeStore) UpdateSSOProvider(_ context.Context, _, _, providerID string, in db.SSOProviderUpdate) (db.SSOProvider, error) {
	p := fakeSSOProvider(providerID)
	p.Domain, p.Issuer = in.Domain, in.Issuer
	if in.OIDC != nil {
		p.OIDC = in.OIDC
	}
	return p, f.err
}
func (f fakeStore) DeleteSSOProvider(context.Context, string, string, string) error { return f.err }
func (f fakeStore) SSOProviderConfigs(_ context.Context, fl db.SSOConfigFilter) ([]db.SSOProviderConfig, error) {
	id := fl.ProviderID
	if id == "" {
		id = "acme-okta"
	}
	return []db.SSOProviderConfig{{
		SSOProvider: fakeSSOProvider(id), OrgID: testOrgID, UserID: "u1",
		Secrets: db.SSOSecrets{ClientSecret: fakeSSOSecret},
	}}, f.err
}
func (f fakeStore) ImportSSOProvider(context.Context, string, string, db.SSOProviderInput) (string, error) {
	return db.SSOImportExists, f.err
}
