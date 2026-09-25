package db

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// Verifies the API-owned SSO provider registry: owners/admins manage it, members
// and other orgs cannot see it (RLS), secrets never come back on a user-facing
// read, the internal read returns them for live providers only, changes are
// audited, and the import path adopts unknown providers but never resurrects a
// deleted one. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestSSOProviders(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	owner, member, other := "sso-p-owner-"+u, "sso-p-member-"+u, "sso-p-other-"+u
	slug, otherSlug := "sso-p-"+u, "sso-p-other-"+u
	org, err := d.CreateOrg(ctx, owner, owner+"@example.com", "SSO Providers Co", slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	otherOrg, err := d.CreateOrg(ctx, other, other+"@example.com", "Other Co", otherSlug)
	if err != nil {
		t.Fatalf("CreateOrg other: %v", err)
	}
	if _, _, err := d.Me(ctx, member, member+"@example.com"); err != nil {
		t.Fatalf("Me member: %v", err)
	}
	if _, _, err := d.AddMember(ctx, owner, slug, member+"@example.com", RoleMember); err != nil {
		t.Fatalf("AddMember: %v", err)
	}

	const secret = "oidc-client-secret-value"
	domain := "acme-" + u + ".example"
	providerID := "acme-okta-" + u
	created, err := d.CreateSSOProvider(ctx, owner, slug, SSOProviderInput{
		ProviderID: providerID, Type: SSOTypeOIDC, Domain: domain, Issuer: "https://idp.example.com",
		OIDC:    &SSOOIDCConfig{ClientID: "client-1", PKCE: true},
		Secrets: SSOSecrets{ClientSecret: secret},
	})
	if err != nil {
		t.Fatalf("CreateSSOProvider: %v", err)
	}
	if created.OIDC == nil || !created.OIDC.ClientSecretSet || created.OIDC.ClientID != "client-1" {
		t.Fatalf("created provider = %+v", created)
	}

	// Secret masking: no user-facing read carries the secret.
	list, err := d.ListSSOProviders(ctx, owner, slug)
	if err != nil || len(list) != 1 {
		t.Fatalf("ListSSOProviders = %v, %v", list, err)
	}
	got, err := d.GetSSOProvider(ctx, owner, slug, providerID)
	if err != nil {
		t.Fatalf("GetSSOProvider: %v", err)
	}
	for _, p := range append(list, got, created) {
		raw, _ := json.Marshal(p)
		if strings.Contains(string(raw), secret) {
			t.Fatalf("user-facing read leaked the secret: %s", raw)
		}
	}

	// Members and other orgs are refused; RLS hides the rows from them too.
	if _, err := d.ListSSOProviders(ctx, member, slug); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member ListSSOProviders err = %v, want ErrForbidden", err)
	}
	if _, err := d.ListSSOProviders(ctx, other, slug); !errors.Is(err, ErrNotMember) {
		t.Fatalf("outsider ListSSOProviders err = %v, want ErrNotMember", err)
	}
	if _, err := d.CreateSSOProvider(ctx, member, slug, SSOProviderInput{ProviderID: "m-" + u, Type: SSOTypeOIDC, Issuer: "https://x"}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member CreateSSOProvider err = %v, want ErrForbidden", err)
	}
	for _, who := range []string{member, other} {
		if n := visibleSSORows(t, ctx, cfg.AppURL, who); n != 0 {
			t.Fatalf("RLS: %s sees %d sso_providers rows directly, want 0", who, n)
		}
	}
	if n := visibleSSORows(t, ctx, cfg.AppURL, owner); n != 1 {
		t.Fatalf("RLS: owner sees %d rows, want 1", n)
	}
	// An outsider cannot write into the org past RLS either (policy WITH CHECK).
	if err := insertSSORowAs(ctx, cfg.AppURL, other, org.ID, "rls-bypass-"+u); err == nil {
		t.Fatal("RLS: an outsider inserted an SSO provider into another org")
	}

	// Provider ids and domains are unique among live providers, across orgs.
	if _, err := d.CreateSSOProvider(ctx, other, otherSlug, SSOProviderInput{
		ProviderID: providerID, Type: SSOTypeOIDC, Issuer: "https://idp.other.com",
		OIDC: &SSOOIDCConfig{ClientID: "c"}, Secrets: SSOSecrets{ClientSecret: "s"},
	}); !errors.Is(err, ErrSSOProviderIDTaken) {
		t.Fatalf("duplicate provider id err = %v, want ErrSSOProviderIDTaken", err)
	}
	if _, err := d.CreateSSOProvider(ctx, other, otherSlug, SSOProviderInput{
		ProviderID: "other-" + u, Type: SSOTypeOIDC, Domain: domain, Issuer: "https://idp.other.com",
		OIDC: &SSOOIDCConfig{ClientID: "c"}, Secrets: SSOSecrets{ClientSecret: "s"},
	}); !errors.Is(err, ErrSSOProviderDomainUse) {
		t.Fatalf("duplicate domain err = %v, want ErrSSOProviderDomainUse", err)
	}

	// The internal read returns full config (secret included) by id, domain,
	// subdomain and org.
	for _, f := range []SSOConfigFilter{{ProviderID: providerID}, {Domain: domain}, {Domain: "eng." + domain}, {OrgID: org.ID}} {
		cfgs, err := d.SSOProviderConfigs(ctx, f)
		if err != nil || len(cfgs) != 1 {
			t.Fatalf("SSOProviderConfigs(%+v) = %v, %v", f, cfgs, err)
		}
		if cfgs[0].Secrets.ClientSecret != secret || cfgs[0].OrgID != org.ID || cfgs[0].UserID != owner {
			t.Fatalf("internal config = %+v", cfgs[0])
		}
	}
	if cfgs, _ := d.SSOProviderConfigs(ctx, SSOConfigFilter{OrgID: otherOrg.ID}); len(cfgs) != 0 {
		t.Fatalf("other org has %d providers, want 0", len(cfgs))
	}
	if cfgs, _ := d.SSOProviderConfigs(ctx, SSOConfigFilter{}); len(cfgs) != 0 {
		t.Fatalf("an unfiltered read returned %d providers, want none", len(cfgs))
	}

	// Update keeps the secret unless replaced.
	newDomain := "corp-" + domain
	upd, err := d.UpdateSSOProvider(ctx, owner, slug, providerID, SSOProviderUpdate{
		Domain: newDomain, Issuer: "https://idp.example.com", OIDC: &SSOOIDCConfig{ClientID: "client-2", PKCE: true},
	})
	if err != nil || upd.Domain != newDomain || upd.OIDC.ClientID != "client-2" || !upd.OIDC.ClientSecretSet {
		t.Fatalf("UpdateSSOProvider = %+v, %v", upd, err)
	}
	if cfgs, _ := d.SSOProviderConfigs(ctx, SSOConfigFilter{ProviderID: providerID}); len(cfgs) != 1 || cfgs[0].Secrets.ClientSecret != secret {
		t.Fatalf("secret not kept across update: %+v", cfgs)
	}

	// Delete ends it: gone from the internal read, and a stale cache row cannot
	// bring it back through import.
	if err := d.DeleteSSOProvider(ctx, owner, slug, providerID); err != nil {
		t.Fatalf("DeleteSSOProvider: %v", err)
	}
	if cfgs, _ := d.SSOProviderConfigs(ctx, SSOConfigFilter{ProviderID: providerID}); len(cfgs) != 0 {
		t.Fatalf("deleted provider still served: %+v", cfgs)
	}
	if err := d.DeleteSSOProvider(ctx, owner, slug, providerID); !errors.Is(err, ErrSSOProviderNotFound) {
		t.Fatalf("second delete err = %v, want ErrSSOProviderNotFound", err)
	}
	legacy := SSOProviderInput{
		ProviderID: providerID, Type: SSOTypeOIDC, Domain: domain, Issuer: "https://idp.example.com",
		OIDC: &SSOOIDCConfig{ClientID: "client-1", PKCE: true}, Secrets: SSOSecrets{ClientSecret: secret},
	}
	if outcome, err := d.ImportSSOProvider(ctx, org.ID, owner, legacy); err != nil || outcome != SSOImportDeleted {
		t.Fatalf("import of a deleted provider = %q, %v; want %q", outcome, err, SSOImportDeleted)
	}

	// Import adopts a provider the API has never seen, once.
	legacy.ProviderID = "legacy-" + u
	legacy.Domain = "legacy-" + domain
	if outcome, err := d.ImportSSOProvider(ctx, org.ID, owner, legacy); err != nil || outcome != SSOImportImported {
		t.Fatalf("first import = %q, %v", outcome, err)
	}
	if outcome, err := d.ImportSSOProvider(ctx, org.ID, owner, legacy); err != nil || outcome != SSOImportExists {
		t.Fatalf("second import = %q, %v; want exists", outcome, err)
	}
	if outcome, err := d.ImportSSOProvider(ctx, "00000000-0000-0000-0000-000000000000", owner, SSOProviderInput{
		ProviderID: "orphan-" + u, Type: SSOTypeOIDC, Issuer: "https://x",
	}); err != nil || outcome != SSOImportNoOrg {
		t.Fatalf("import into a missing org = %q, %v; want no_org", outcome, err)
	}

	// Every change is in the org's audit log.
	events, err := d.ListAuditLog(ctx, owner, slug, 50)
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	counts := map[string]int{}
	for _, e := range events {
		counts[e.Action]++
	}
	if counts[string(audit.ActionSSOProviderCreated)] != 2 || counts[string(audit.ActionSSOProviderUpdated)] != 1 || counts[string(audit.ActionSSOProviderDeleted)] != 1 {
		t.Fatalf("audit counts = %v", counts)
	}
}

// visibleSSORows counts the sso_providers rows a user sees directly as the app
// (RLS) role, bypassing the Go role checks.
func visibleSSORows(t *testing.T, ctx context.Context, appURL, userID string) int {
	t.Helper()
	conn, err := pgx.Connect(ctx, appURL)
	if err != nil {
		t.Fatalf("connect app role: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SELECT set_config('flagon.user_id', $1, true)", userID); err != nil {
		t.Fatalf("bind user: %v", err)
	}
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM public.sso_providers`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}

// insertSSORowAs tries a raw insert as the app role bound to userID.
func insertSSORowAs(ctx context.Context, appURL, userID, orgID, providerID string) error {
	conn, err := pgx.Connect(ctx, appURL)
	if err != nil {
		return err
	}
	defer func() { _ = conn.Close(ctx) }()
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "SELECT set_config('flagon.user_id', $1, true)", userID); err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`INSERT INTO public.sso_providers (org_id, provider_id, type, issuer) VALUES ($1, $2, 'oidc', 'https://x')`,
		orgID, providerID)
	return err
}
