package db

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/secrets"
)

// Encryption at rest for stored credentials (see internal/secrets). SSO client
// secrets and SAML signing keys are sealed field by field inside the jsonb
// secrets column, so key presence (the `?` operator the masked reads rely on)
// still means "set" while the values themselves are ciphertext.

// Associated data per sealed field: a ciphertext moved into another field (or
// another kind of secret) fails to open.
const (
	aadSSOClientSecret = "sso.client_secret" //nolint:gosec // G101: a label bound into the ciphertext, not a credential
	aadSSOPrivateKey   = "sso.private_key"
)

// SetKeyring installs the keyring used to seal and open stored credentials.
// cmd/flagon-server calls it once at boot, before serving.
func (d *DB) SetKeyring(k *secrets.Keyring) {
	if d != nil {
		d.keys = k
	}
}

var (
	devKeyringOnce sync.Once
	devKeyring     *secrets.Keyring
)

// keyring is the configured keyring, or the well-known development keyring when
// none was installed (tests, and local dev where cmd/flagon-server warns loudly).
// Production refuses to boot without a real key, so it never reaches the
// fallback.
func (d *DB) keyring() *secrets.Keyring {
	if d != nil && d.keys != nil {
		return d.keys
	}
	devKeyringOnce.Do(func() {
		devKeyring, _ = secrets.NewKeyring(secrets.DevKey)
	})
	return devKeyring
}

// ssoSecretsJSON renders the secrets column with every value sealed, dropping
// empty values so presence (the `?` operator) means "set".
func ssoSecretsJSON(k *secrets.Keyring, s SSOSecrets) ([]byte, error) {
	sealed, err := sealSSOSecrets(k, s)
	if err != nil {
		return nil, err
	}
	return json.Marshal(sealed) //nolint:gosec // G117: serializing the (sealed) secrets is the point; this feeds the protected secrets column, never a response
}

func sealSSOSecrets(k *secrets.Keyring, s SSOSecrets) (SSOSecrets, error) {
	var out SSOSecrets
	var err error
	if out.ClientSecret, err = k.Seal(aadSSOClientSecret, s.ClientSecret); err != nil {
		return SSOSecrets{}, err
	}
	if out.PrivateKey, err = k.Seal(aadSSOPrivateKey, s.PrivateKey); err != nil {
		return SSOSecrets{}, err
	}
	return out, nil
}

// openSSOSecrets decodes and decrypts a stored secrets column. Legacy plaintext
// values (written before encryption at rest) are returned as-is; the boot
// migration (SealStoredSecrets) rewrites them sealed.
func openSSOSecrets(k *secrets.Keyring, raw []byte) (SSOSecrets, error) {
	var stored SSOSecrets
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &stored); err != nil {
			return SSOSecrets{}, err
		}
	}
	var out SSOSecrets
	var err error
	if out.ClientSecret, err = k.Open(aadSSOClientSecret, stored.ClientSecret); err != nil {
		return SSOSecrets{}, err
	}
	if out.PrivateKey, err = k.Open(aadSSOPrivateKey, stored.PrivateKey); err != nil {
		return SSOSecrets{}, err
	}
	return out, nil
}

// SealStoredSecrets encrypts every stored credential that is still plaintext (or
// sealed under a retired key) with the keyring's primary key. It is idempotent:
// already-current values are left alone, so running it on every boot (and on
// several machines at once - rows are locked) is safe. It connects as the
// migrator (schema owner) because it must rewrite every org's rows, which the
// RLS-bound app role cannot. Returns how many rows it rewrote.
func SealStoredSecrets(ctx context.Context, cfg Config, k *secrets.Keyring) (int, error) {
	if cfg.MigratorURL == "" {
		return 0, ErrUnavailable
	}
	conn, err := pgx.Connect(ctx, cfg.MigratorURL)
	if err != nil {
		return 0, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	defer func() { _ = conn.Close(ctx) }()

	tx, err := conn.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	rows, err := tx.Query(ctx,
		`SELECT id, secrets FROM public.sso_providers WHERE secrets <> '{}'::jsonb FOR UPDATE`)
	if err != nil {
		return 0, err
	}
	type pending struct {
		id  string
		raw []byte
	}
	var todo []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.raw); err != nil {
			rows.Close()
			return 0, err
		}
		var stored SSOSecrets
		if err := json.Unmarshal(p.raw, &stored); err != nil {
			rows.Close()
			return 0, err
		}
		if k.NeedsReseal(stored.ClientSecret) || k.NeedsReseal(stored.PrivateKey) {
			todo = append(todo, p)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}

	rewritten := 0
	for _, p := range todo {
		plain, err := openSSOSecrets(k, p.raw)
		if err != nil {
			// Sealed under a key this keyring does not hold (or damaged): leave
			// the row untouched and keep going, so one bad row never blocks the
			// boot. Reads of it fail until the right key is configured.
			slog.WarnContext(ctx, "could not open stored SSO secrets; leaving the row as is",
				"sso_provider_row", p.id, "err", err)
			continue
		}
		sealed, err := ssoSecretsJSON(k, plain)
		if err != nil {
			return 0, err
		}
		if _, err := tx.Exec(ctx, `UPDATE public.sso_providers SET secrets = $1 WHERE id = $2`, sealed, p.id); err != nil {
			return 0, err
		}
		rewritten++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return rewritten, nil
}
