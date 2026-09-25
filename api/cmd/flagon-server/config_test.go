package main

import (
	"context"
	"encoding/base64"
	"testing"

	"github.com/urfave/cli/v3"

	"github.com/flagon-io/flagon/api/internal/secrets"
)

// classify runs a command carrying the serve flags that drive the environment
// decision and reports (bindHost, isProduction).
func classify(t *testing.T, args ...string) (string, bool) {
	t.Helper()
	var host string
	var prod bool
	cmd := &cli.Command{
		Name: "serve",
		Flags: []cli.Flag{
			&cli.StringFlag{Name: "host", Sources: cli.EnvVars("FLAGON_HOST")},
			&cli.StringFlag{Name: "environment", Sources: cli.EnvVars("FLAGON_ENV")},
		},
		Action: func(_ context.Context, cmd *cli.Command) error {
			host, prod = bindHost(cmd), isProduction(cmd)
			return nil
		},
	}
	if err := cmd.Run(context.Background(), append([]string{"serve"}, args...)); err != nil {
		t.Fatal(err)
	}
	return host, prod
}

// A fresh checkout (no env at all) binds loopback and is development; anything
// routable, or Fly, is production unless FLAGON_ENV says otherwise.
func TestEnvironmentClassification(t *testing.T) {
	cases := []struct {
		name     string
		env      map[string]string
		args     []string
		wantHost string
		wantProd bool
	}{
		{"zero config is loopback development", nil, nil, "127.0.0.1", false},
		{"explicit all interfaces is production", map[string]string{"FLAGON_HOST": "0.0.0.0"}, nil, "0.0.0.0", true},
		{"host flag all interfaces is production", nil, []string{"--host", "0.0.0.0"}, "0.0.0.0", true},
		{"explicit loopback is development", map[string]string{"FLAGON_HOST": "localhost"}, nil, "localhost", false},
		{"Fly binds all interfaces and is production", map[string]string{"FLY_APP_NAME": "flagon-api"}, nil, "", true},
		{"Fly with loopback is still production", map[string]string{"FLY_APP_NAME": "flagon-api", "FLAGON_HOST": "127.0.0.1"}, nil, "127.0.0.1", true},
		{"container with FLAGON_ENV=development", map[string]string{"FLAGON_HOST": "0.0.0.0", "FLAGON_ENV": "development"}, nil, "0.0.0.0", false},
		{"FLAGON_ENV=production on loopback", map[string]string{"FLAGON_ENV": "production"}, nil, "127.0.0.1", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, k := range []string{"FLAGON_HOST", "FLAGON_ENV", "FLY_APP_NAME"} {
				t.Setenv(k, tc.env[k])
			}
			host, prod := classify(t, tc.args...)
			if host != tc.wantHost || prod != tc.wantProd {
				t.Fatalf("bindHost, isProduction = %q, %v; want %q, %v", host, prod, tc.wantHost, tc.wantProd)
			}
		})
	}
}

func testKey(b byte) []byte {
	k := make([]byte, secrets.KeySize)
	for i := range k {
		k[i] = b + byte(i)
	}
	return k
}

// Rotation: the new key seals, a retired key still opens old values (which the
// boot re-seal then moves under the new key), and bad input fails the boot.
func TestNewKeyringRotation(t *testing.T) {
	oldRaw := base64.StdEncoding.EncodeToString(testKey(1))
	newRaw := base64.StdEncoding.EncodeToString(testKey(2))

	old, err := newKeyring(oldRaw, "", true)
	if err != nil {
		t.Fatal(err)
	}
	sealedOld, err := old.Seal("aad", "s3cret")
	if err != nil {
		t.Fatal(err)
	}

	rotated, err := newKeyring(newRaw, " "+oldRaw+" ", true)
	if err != nil {
		t.Fatalf("newKeyring with a retired key: %v", err)
	}
	if rotated.PrimaryID() != secrets.KeyID(testKey(2)) {
		t.Fatal("the current key must be the primary (sealing) key")
	}
	if got, err := rotated.Open("aad", sealedOld); err != nil || got != "s3cret" {
		t.Fatalf("retired key open = %q, %v", got, err)
	}
	if !rotated.NeedsReseal(sealedOld) {
		t.Fatal("a value under a retired key must be flagged for re-sealing on boot")
	}
	resealed, _ := rotated.Seal("aad", "s3cret")
	if rotated.NeedsReseal(resealed) {
		t.Fatal("re-sealing must be idempotent: a value under the current key needs nothing")
	}

	// Without the retired key, old values are unreadable (so rotation needs it).
	if _, err := newKeyringMust(t, newRaw).Open("aad", sealedOld); err == nil {
		t.Fatal("opening an old value without its retired key must fail")
	}

	if _, err := newKeyring(newRaw, "not-a-key", true); err == nil {
		t.Fatal("a malformed retired key must fail the boot")
	}
	if _, err := newKeyring("", "", true); err == nil {
		t.Fatal("production without FLAGON_SECRETS_KEY must fail the boot")
	}
	if k, err := newKeyring("", oldRaw, false); err != nil || k.PrimaryID() != secrets.KeyID(secrets.DevKey) {
		t.Fatalf("development falls back to the dev key (retired keys still honored): %v", err)
	}
}

func newKeyringMust(t *testing.T, primary string) *secrets.Keyring {
	t.Helper()
	k, err := newKeyring(primary, "", true)
	if err != nil {
		t.Fatal(err)
	}
	return k
}
