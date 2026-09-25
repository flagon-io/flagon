package service

import (
	"context"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/flagon-io/flagon/api/internal/db"
)

// SSO provider management. The API is the source of truth for an org's OIDC and
// SAML providers; the app's auth layer runs the protocol flow from a cache it
// rebuilds from here on every SSO sign-in. Secrets are write-only: they are
// accepted on create/update and never returned by a read.

// ssoOverrides give the SSO sentinels their caller-facing status and wording.
var ssoOverrides = []Override{
	{db.ErrSSOProviderNotFound, http.StatusNotFound, "SSO provider not found"},
	{db.ErrSSOProviderIDTaken, http.StatusConflict, "that provider ID is already in use; choose another"},
	{db.ErrSSOProviderDomainUse, http.StatusConflict, "another SSO provider already uses that email domain"},
}

// providerIDPattern is the provider ID rule: it becomes part of the sign-in
// callback URL the IdP is configured with, so keep it a short lowercase slug.
var providerIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}$`)

// domainPattern is a bare email domain (no scheme, path, port or wildcard).
var domainPattern = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$`)

// reservedProviderIDs are account provider ids the auth layer already uses; an
// SSO provider named after one would collide with it.
var reservedProviderIDs = map[string]bool{
	"credential": true, "email-otp": true, "magic-link": true, "phone-number": true,
	"anonymous": true, "google": true, "github": true, "sso": true, "saml": true, "oidc": true,
}

// SSOProviderCreate is a create request, as the REST body and the tool input
// both express it.
type SSOProviderCreate struct {
	ProviderID string
	Type       string
	Domain     string
	Issuer     string

	// OIDC.
	ClientID          string
	ClientSecret      string
	DiscoveryEndpoint string
	Scopes            []string
	PKCE              *bool

	// SAML.
	EntryPoint           string
	Cert                 string
	Audience             string
	WantAssertionsSigned bool
	AuthnRequestsSigned  bool
	PrivateKey           string
}

// SSOProviderPatch is a partial update: a nil field is left as it is. The
// provider ID and type are immutable. A secret left nil keeps the stored one.
type SSOProviderPatch struct {
	Domain *string
	Issuer *string

	ClientID          *string
	ClientSecret      *string
	DiscoveryEndpoint *string
	Scopes            *[]string
	PKCE              *bool

	EntryPoint           *string
	Cert                 *string
	Audience             *string
	WantAssertionsSigned *bool
	AuthnRequestsSigned  *bool
	PrivateKey           *string
}

// ListSSOProviders returns an org's SSO providers, secrets masked (owners/admins).
func (s *Service) ListSSOProviders(ctx context.Context, a Actor, orgSlug string) ([]db.SSOProvider, error) {
	ps, err := s.store.ListSSOProviders(ctx, a.UserID, orgSlug)
	return ps, classify(err, ssoOverrides...)
}

// GetSSOProvider returns one SSO provider, secrets masked (owners/admins).
func (s *Service) GetSSOProvider(ctx context.Context, a Actor, orgSlug, providerID string) (db.SSOProvider, error) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return db.SSOProvider{}, Invalid("provider_id is required")
	}
	p, err := s.store.GetSSOProvider(ctx, a.UserID, orgSlug, providerID)
	return p, classify(err, ssoOverrides...)
}

// CreateSSOProvider validates and registers a provider for an org (owners/admins).
func (s *Service) CreateSSOProvider(ctx context.Context, a Actor, orgSlug string, in SSOProviderCreate) (db.SSOProvider, error) {
	input, err := normalizeSSOCreate(in)
	if err != nil {
		return db.SSOProvider{}, err
	}
	p, err := s.store.CreateSSOProvider(ctx, a.UserID, orgSlug, input)
	return p, classify(err, ssoOverrides...)
}

// UpdateSSOProvider merges a partial edit onto the current provider, validates
// the result as a whole, and saves it (owners/admins).
func (s *Service) UpdateSSOProvider(ctx context.Context, a Actor, orgSlug, providerID string, p SSOProviderPatch) (db.SSOProvider, error) {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return db.SSOProvider{}, Invalid("provider_id is required")
	}
	cur, err := s.store.GetSSOProvider(ctx, a.UserID, orgSlug, providerID)
	if err != nil {
		return db.SSOProvider{}, classify(err, ssoOverrides...)
	}
	upd, err := mergeSSOPatch(cur, p)
	if err != nil {
		return db.SSOProvider{}, err
	}
	out, err := s.store.UpdateSSOProvider(ctx, a.UserID, orgSlug, providerID, upd)
	return out, classify(err, ssoOverrides...)
}

// DeleteSSOProvider removes a provider (owners/admins). Sign-in through it stops
// at the next attempt.
func (s *Service) DeleteSSOProvider(ctx context.Context, a Actor, orgSlug, providerID string) error {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return Invalid("provider_id is required")
	}
	return classify(s.store.DeleteSSOProvider(ctx, a.UserID, orgSlug, providerID), ssoOverrides...)
}

// normalizeSSOCreate trims, defaults and validates a create request into the
// store's input.
func normalizeSSOCreate(in SSOProviderCreate) (db.SSOProviderInput, error) {
	out := db.SSOProviderInput{
		ProviderID: strings.ToLower(strings.TrimSpace(in.ProviderID)),
		Type:       strings.ToLower(strings.TrimSpace(in.Type)),
		Domain:     strings.ToLower(strings.TrimSpace(in.Domain)),
		Issuer:     strings.TrimSpace(in.Issuer),
	}
	if !providerIDPattern.MatchString(out.ProviderID) {
		return out, Invalid("provider_id must be 2-63 lowercase letters, digits or hyphens, starting with a letter or digit")
	}
	if reservedProviderIDs[out.ProviderID] {
		return out, Invalid("that provider_id is reserved; choose another")
	}
	switch out.Type {
	case db.SSOTypeOIDC:
		pkce := true
		if in.PKCE != nil {
			pkce = *in.PKCE
		}
		out.OIDC = &db.SSOOIDCConfig{
			ClientID:          strings.TrimSpace(in.ClientID),
			DiscoveryEndpoint: strings.TrimSpace(in.DiscoveryEndpoint),
			Scopes:            cleanScopes(in.Scopes),
			PKCE:              pkce,
		}
		out.Secrets.ClientSecret = strings.TrimSpace(in.ClientSecret)
	case db.SSOTypeSAML:
		out.SAML = &db.SSOSAMLConfig{
			EntryPoint:           strings.TrimSpace(in.EntryPoint),
			Cert:                 strings.TrimSpace(in.Cert),
			Audience:             strings.TrimSpace(in.Audience),
			WantAssertionsSigned: in.WantAssertionsSigned,
			AuthnRequestsSigned:  in.AuthnRequestsSigned,
		}
		out.Secrets.PrivateKey = strings.TrimSpace(in.PrivateKey)
	default:
		return out, Invalid("type must be oidc or saml")
	}
	if err := validateSSO(out.Type, out.Domain, out.Issuer, out.OIDC, out.SAML, out.Secrets); err != nil {
		return out, err
	}
	return out, nil
}

// mergeSSOPatch applies a partial edit to the current provider, returning the
// full new state for the store, validated as a whole.
func mergeSSOPatch(cur db.SSOProvider, p SSOProviderPatch) (db.SSOProviderUpdate, error) {
	upd := db.SSOProviderUpdate{Domain: cur.Domain, Issuer: cur.Issuer}
	if p.Domain != nil {
		upd.Domain = strings.ToLower(strings.TrimSpace(*p.Domain))
	}
	if p.Issuer != nil {
		upd.Issuer = strings.TrimSpace(*p.Issuer)
	}
	// Secret presence after the edit, for validation. The secret values
	// themselves are never read back; only whether one is stored.
	var secrets db.SSOSecrets
	oidcFields := p.ClientID != nil || p.ClientSecret != nil || p.DiscoveryEndpoint != nil || p.Scopes != nil || p.PKCE != nil
	samlFields := p.EntryPoint != nil || p.Cert != nil || p.Audience != nil || p.WantAssertionsSigned != nil || p.AuthnRequestsSigned != nil || p.PrivateKey != nil
	switch cur.Type {
	case db.SSOTypeOIDC:
		if samlFields {
			return upd, Invalid("this is an OIDC provider; SAML fields do not apply")
		}
		c := db.SSOOIDCConfig{}
		if cur.OIDC != nil {
			c = *cur.OIDC
		}
		if p.ClientID != nil {
			c.ClientID = strings.TrimSpace(*p.ClientID)
		}
		if p.DiscoveryEndpoint != nil {
			c.DiscoveryEndpoint = strings.TrimSpace(*p.DiscoveryEndpoint)
		}
		if p.Scopes != nil {
			c.Scopes = cleanScopes(*p.Scopes)
		}
		if p.PKCE != nil {
			c.PKCE = *p.PKCE
		}
		if c.ClientSecretSet {
			secrets.ClientSecret = "set"
		}
		if p.ClientSecret != nil {
			v := strings.TrimSpace(*p.ClientSecret)
			if v == "" {
				return upd, Invalid("client_secret cannot be empty; omit it to keep the current secret")
			}
			upd.ClientSecret = &v
			secrets.ClientSecret = v
		}
		upd.OIDC = &c
	case db.SSOTypeSAML:
		if oidcFields {
			return upd, Invalid("this is a SAML provider; OIDC fields do not apply")
		}
		c := db.SSOSAMLConfig{}
		if cur.SAML != nil {
			c = *cur.SAML
		}
		if p.EntryPoint != nil {
			c.EntryPoint = strings.TrimSpace(*p.EntryPoint)
		}
		if p.Cert != nil {
			c.Cert = strings.TrimSpace(*p.Cert)
		}
		if p.Audience != nil {
			c.Audience = strings.TrimSpace(*p.Audience)
		}
		if p.WantAssertionsSigned != nil {
			c.WantAssertionsSigned = *p.WantAssertionsSigned
		}
		if p.AuthnRequestsSigned != nil {
			c.AuthnRequestsSigned = *p.AuthnRequestsSigned
		}
		if c.PrivateKeySet {
			secrets.PrivateKey = "set"
		}
		if p.PrivateKey != nil {
			v := strings.TrimSpace(*p.PrivateKey)
			upd.PrivateKey = &v // "" clears the signing key
			secrets.PrivateKey = v
		}
		upd.SAML = &c
	}
	if err := validateSSO(cur.Type, upd.Domain, upd.Issuer, upd.OIDC, upd.SAML, secrets); err != nil {
		return upd, err
	}
	return upd, nil
}

// validateSSO checks a provider's full state (after defaults or a merge).
func validateSSO(typ, domain, issuer string, oidc *db.SSOOIDCConfig, saml *db.SSOSAMLConfig, secrets db.SSOSecrets) error {
	if domain != "" && !domainPattern.MatchString(domain) {
		return Invalid("domain must be a bare email domain such as acme.com")
	}
	if issuer == "" {
		return Invalid("issuer is required")
	}
	switch typ {
	case db.SSOTypeOIDC:
		if !httpURL(issuer, true) {
			return Invalid("issuer must be the identity provider's https URL")
		}
		if oidc == nil || oidc.ClientID == "" {
			return Invalid("client_id is required for an OIDC provider")
		}
		if secrets.ClientSecret == "" {
			return Invalid("client_secret is required for an OIDC provider")
		}
		if oidc.DiscoveryEndpoint != "" && !httpURL(oidc.DiscoveryEndpoint, true) {
			return Invalid("discovery_endpoint must be an https URL")
		}
	case db.SSOTypeSAML:
		if saml == nil || !httpURL(saml.EntryPoint, true) {
			return Invalid("entry_point must be the identity provider's https single sign-on URL")
		}
		if !looksLikeCert(saml.Cert) {
			return Invalid("cert must be the identity provider's signing certificate (PEM or base64)")
		}
		if saml.AuthnRequestsSigned && secrets.PrivateKey == "" {
			return Invalid("private_key is required when authn_requests_signed is on")
		}
	}
	return nil
}

// httpURL reports whether s is an absolute https URL (plain http is allowed for a
// localhost IdP, which is how the flow is exercised in development).
func httpURL(s string, requireHTTPS bool) bool {
	u, err := url.Parse(s)
	if err != nil || u.Host == "" {
		return false
	}
	switch u.Scheme {
	case "https":
		return true
	case "http":
		h := u.Hostname()
		return !requireHTTPS || h == "localhost" || h == "127.0.0.1"
	}
	return false
}

// looksLikeCert accepts a PEM certificate or the bare base64 body IdPs often
// hand out. It is a shape check; the auth layer parses the certificate itself.
func looksLikeCert(s string) bool {
	if strings.Contains(s, "BEGIN CERTIFICATE") {
		return true
	}
	body := strings.Join(strings.Fields(s), "")
	if len(body) < 64 {
		return false
	}
	for _, r := range body {
		b64 := r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '+' || r == '/' || r == '='
		if !b64 {
			return false
		}
	}
	return true
}

// cleanScopes trims and de-duplicates requested OIDC scopes (nil when none).
func cleanScopes(in []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, s := range in {
		s = strings.TrimSpace(s)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
	}
	return out
}
