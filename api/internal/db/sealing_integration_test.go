package db

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/secrets"
)

// TestSSOSecretsSealedAtRest proves SSO credentials never sit in the database in
// plaintext: new writes are sealed, the internal read opens them, and the boot
// migration (SealStoredSecrets) idempotently seals legacy plaintext rows and
// re-seals rows under a retired key. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestSSOSecretsSealedAtRest(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}

	oldKey := make([]byte, secrets.KeySize)
	newKey := make([]byte, secrets.KeySize)
	for i := range newKey {
		oldKey[i], newKey[i] = byte(i), byte(255-i)
	}
	oldRing, err := secrets.NewKeyring(oldKey)
	if err != nil {
		t.Fatal(err)
	}
	ring, err := secrets.NewKeyring(newKey, oldKey)
	if err != nil {
		t.Fatal(err)
	}

	d := Open(ctx, cfg)
	defer d.Close()
	d.SetKeyring(ring)

	u := unique(t)
	owner, slug := "seal-owner-"+u, "seal-"+u
	org, err := d.CreateOrg(ctx, owner, owner+"@example.com", "Seal Co", slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}

	const secret = "oidc-client-secret-" + "plaintext"
	providerID := "seal-okta-" + u
	if _, err := d.CreateSSOProvider(ctx, owner, slug, SSOProviderInput{
		ProviderID: providerID, Type: SSOTypeOIDC, Domain: "seal-" + u + ".example", Issuer: "https://idp.example.com",
		OIDC:    &SSOOIDCConfig{ClientID: "client-1"},
		Secrets: SSOSecrets{ClientSecret: secret},
	}); err != nil {
		t.Fatalf("CreateSSOProvider: %v", err)
	}

	migrator, err := pgx.Connect(ctx, cfg.MigratorURL)
	if err != nil {
		t.Fatalf("connect migrator: %v", err)
	}
	defer func() { _ = migrator.Close(ctx) }()
	rawSecrets := func(pid string) string {
		t.Helper()
		var raw string
		if err := migrator.QueryRow(ctx,
			`SELECT secrets::text FROM public.sso_providers WHERE provider_id = $1 AND deleted_at IS NULL`, pid).
			Scan(&raw); err != nil {
			t.Fatalf("read raw secrets: %v", err)
		}
		return raw
	}

	// A fresh write is sealed under the primary key, and presence still reads.
	if raw := rawSecrets(providerID); strings.Contains(raw, secret) || !strings.Contains(raw, "enc:v1:"+ring.PrimaryID()+":") {
		t.Fatalf("new secret not sealed under the primary key: %s", raw)
	}
	got, err := d.GetSSOProvider(ctx, owner, slug, providerID)
	if err != nil || got.OIDC == nil || !got.OIDC.ClientSecretSet {
		t.Fatalf("GetSSOProvider = %+v, %v (want client_secret_set)", got, err)
	}
	configs, err := d.SSOProviderConfigs(ctx, SSOConfigFilter{ProviderID: providerID})
	if err != nil || len(configs) != 1 || configs[0].Secrets.ClientSecret != secret {
		t.Fatalf("internal read did not open the secret: %+v, %v", configs, err)
	}

	// Legacy rows: one plaintext, one sealed under the retired key.
	legacyID, retiredID := "seal-legacy-"+u, "seal-retired-"+u
	retiredSealed, err := oldRing.Seal(aadSSOClientSecret, "retired-secret")
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct{ pid, secrets string }{
		{legacyID, `{"client_secret":"legacy-secret","private_key":"legacy-key"}`},
		{retiredID, `{"client_secret":"` + retiredSealed + `"}`},
	} {
		if _, err := migrator.Exec(ctx,
			`INSERT INTO public.sso_providers (org_id, provider_id, type, domain, issuer, config, secrets)
			 VALUES ($1, $2, 'oidc', '', 'https://idp.example.com', '{"client_id":"c"}', $3::jsonb)`,
			org.ID, row.pid, row.secrets); err != nil {
			t.Fatalf("insert legacy row: %v", err)
		}
	}

	// Legacy plaintext still reads (lazily tolerated) before the migration runs.
	configs, err = d.SSOProviderConfigs(ctx, SSOConfigFilter{ProviderID: legacyID})
	if err != nil || len(configs) != 1 || configs[0].Secrets.ClientSecret != "legacy-secret" {
		t.Fatalf("legacy read = %+v, %v", configs, err)
	}

	n, err := SealStoredSecrets(ctx, cfg, ring)
	if err != nil {
		t.Fatalf("SealStoredSecrets: %v", err)
	}
	if n < 2 {
		t.Fatalf("SealStoredSecrets rewrote %d rows; want at least the 2 legacy rows", n)
	}
	for pid, plain := range map[string]string{legacyID: "legacy-secret", retiredID: "retired-secret"} {
		raw := rawSecrets(pid)
		if strings.Contains(raw, plain) || !strings.Contains(raw, "enc:v1:"+ring.PrimaryID()+":") {
			t.Fatalf("%s not sealed under the primary key after migration: %s", pid, raw)
		}
		configs, err := d.SSOProviderConfigs(ctx, SSOConfigFilter{ProviderID: pid})
		if err != nil || len(configs) != 1 || configs[0].Secrets.ClientSecret != plain {
			t.Fatalf("%s read after migration = %+v, %v", pid, configs, err)
		}
	}
	if raw := rawSecrets(legacyID); strings.Contains(raw, "legacy-key") {
		t.Fatalf("legacy private key left in plaintext: %s", raw)
	}

	// Idempotent: nothing of ours is left to rewrite. (Other tests sharing the
	// database may have rows too, so check ours rather than the global count.)
	before := rawSecrets(legacyID)
	if _, err := SealStoredSecrets(ctx, cfg, ring); err != nil {
		t.Fatalf("second SealStoredSecrets: %v", err)
	}
	if after := rawSecrets(legacyID); after != before {
		t.Fatal("a second run rewrote an already-sealed row")
	}
}
