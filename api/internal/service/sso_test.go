package service

import (
	"errors"
	"testing"

	"github.com/flagon-io/flagon/api/internal/db"
)

const testCert = "MIIDBTCCAe2gAwIBAgIQX2x7Yc7VjJbJ3n6k0p4pYjANBgkqhkiG9w0BAQsFADAtMSswKQYDVQQDEyJhY2NvdW50cy5hY21lLmV4YW1wbGU="

func TestNormalizeSSOCreate(t *testing.T) {
	pkceOff := false
	cases := []struct {
		name string
		in   SSOProviderCreate
		ok   bool
	}{
		{"oidc ok", SSOProviderCreate{ProviderID: " Acme-Okta ", Type: "OIDC", Domain: "Acme.com", Issuer: "https://idp.acme.com", ClientID: "c", ClientSecret: "s"}, true},
		{"oidc pkce off", SSOProviderCreate{ProviderID: "acme", Type: "oidc", Issuer: "https://idp.acme.com", ClientID: "c", ClientSecret: "s", PKCE: &pkceOff}, true},
		{"oidc localhost http allowed", SSOProviderCreate{ProviderID: "dev-idp", Type: "oidc", Issuer: "http://localhost:9000", ClientID: "c", ClientSecret: "s"}, true},
		{"oidc http rejected", SSOProviderCreate{ProviderID: "acme", Type: "oidc", Issuer: "http://idp.acme.com", ClientID: "c", ClientSecret: "s"}, false},
		{"oidc no secret", SSOProviderCreate{ProviderID: "acme", Type: "oidc", Issuer: "https://idp.acme.com", ClientID: "c"}, false},
		{"oidc no client id", SSOProviderCreate{ProviderID: "acme", Type: "oidc", Issuer: "https://idp.acme.com", ClientSecret: "s"}, false},
		{"bad provider id", SSOProviderCreate{ProviderID: "acme okta", Type: "oidc", Issuer: "https://idp.acme.com", ClientID: "c", ClientSecret: "s"}, false},
		{"reserved provider id", SSOProviderCreate{ProviderID: "credential", Type: "oidc", Issuer: "https://idp.acme.com", ClientID: "c", ClientSecret: "s"}, false},
		{"bad domain", SSOProviderCreate{ProviderID: "acme", Type: "oidc", Domain: "https://acme.com", Issuer: "https://idp.acme.com", ClientID: "c", ClientSecret: "s"}, false},
		{"bad type", SSOProviderCreate{ProviderID: "acme", Type: "ldap", Issuer: "x"}, false},
		{"saml ok", SSOProviderCreate{ProviderID: "acme-saml", Type: "saml", Issuer: "https://app.flagon.io/saml/acme", EntryPoint: "https://idp.acme.com/sso", Cert: testCert}, true},
		{"saml pem ok", SSOProviderCreate{ProviderID: "acme-saml", Type: "saml", Issuer: "urn:acme", EntryPoint: "https://idp.acme.com/sso", Cert: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----"}, true},
		{"saml bad cert", SSOProviderCreate{ProviderID: "acme-saml", Type: "saml", Issuer: "urn:acme", EntryPoint: "https://idp.acme.com/sso", Cert: "not a cert"}, false},
		{"saml no entry point", SSOProviderCreate{ProviderID: "acme-saml", Type: "saml", Issuer: "urn:acme", Cert: testCert}, false},
		{"saml signed requests need a key", SSOProviderCreate{ProviderID: "acme-saml", Type: "saml", Issuer: "urn:acme", EntryPoint: "https://idp.acme.com/sso", Cert: testCert, AuthnRequestsSigned: true}, false},
		{"saml signed requests with key", SSOProviderCreate{ProviderID: "acme-saml", Type: "saml", Issuer: "urn:acme", EntryPoint: "https://idp.acme.com/sso", Cert: testCert, AuthnRequestsSigned: true, PrivateKey: "-----BEGIN PRIVATE KEY-----"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			out, err := normalizeSSOCreate(tc.in)
			if tc.ok && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !tc.ok {
				if !errors.Is(err, ErrInvalidInput) {
					t.Fatalf("err = %v, want a 422 validation error", err)
				}
				return
			}
			if tc.name == "oidc ok" {
				if out.ProviderID != "acme-okta" || out.Type != "oidc" || out.Domain != "acme.com" || !out.OIDC.PKCE || out.Secrets.ClientSecret != "s" {
					t.Fatalf("not normalized: %+v", out)
				}
			}
			if tc.name == "oidc pkce off" && out.OIDC.PKCE {
				t.Fatal("explicit pkce=false was ignored")
			}
		})
	}
}

func TestMergeSSOPatch(t *testing.T) {
	oidc := db.SSOProvider{
		ProviderID: "acme", Type: db.SSOTypeOIDC, Domain: "acme.com", Issuer: "https://idp.acme.com",
		OIDC: &db.SSOOIDCConfig{ClientID: "c", PKCE: true, ClientSecretSet: true},
	}
	domain := "corp.acme.com"
	upd, err := mergeSSOPatch(oidc, SSOProviderPatch{Domain: &domain})
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if upd.Domain != domain || upd.Issuer != oidc.Issuer || upd.OIDC.ClientID != "c" || upd.ClientSecret != nil {
		t.Fatalf("partial update changed more than asked: %+v", upd)
	}

	empty := ""
	if _, err := mergeSSOPatch(oidc, SSOProviderPatch{ClientSecret: &empty}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("clearing the OIDC secret should be rejected, got %v", err)
	}
	cert := testCert
	if _, err := mergeSSOPatch(oidc, SSOProviderPatch{Cert: &cert}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("SAML field on an OIDC provider should be rejected, got %v", err)
	}
	secret := "rotated"
	upd, err = mergeSSOPatch(oidc, SSOProviderPatch{ClientSecret: &secret})
	if err != nil || upd.ClientSecret == nil || *upd.ClientSecret != "rotated" {
		t.Fatalf("secret rotation: %+v, %v", upd, err)
	}

	saml := db.SSOProvider{
		ProviderID: "acme-saml", Type: db.SSOTypeSAML, Issuer: "urn:acme",
		SAML: &db.SSOSAMLConfig{EntryPoint: "https://idp.acme.com/sso", Cert: testCert},
	}
	on := true
	if _, err := mergeSSOPatch(saml, SSOProviderPatch{AuthnRequestsSigned: &on}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("signing without a key should be rejected, got %v", err)
	}
	key := "-----BEGIN PRIVATE KEY-----"
	upd, err = mergeSSOPatch(saml, SSOProviderPatch{AuthnRequestsSigned: &on, PrivateKey: &key})
	if err != nil || !upd.SAML.AuthnRequestsSigned || upd.PrivateKey == nil {
		t.Fatalf("signing with a key: %+v, %v", upd, err)
	}
}
