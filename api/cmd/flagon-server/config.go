package main

import (
	"errors"
	"fmt"
	"log/slog"
	"net"
	"os"
	"strings"

	"github.com/urfave/cli/v3"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/secrets"
)

// Development-only fallbacks. They are public (they ship in this file, the
// compose file and the app's .env.example), so they are applied ONLY in
// development (see isProduction); production refuses to start without real
// values rather than silently running on a known secret.
const (
	// devInternalToken matches the app's development default, so a fresh
	// checkout's app and API trust each other with zero setup.
	devInternalToken = "dev-internal-token" //nolint:gosec // G101: public development-only value, refused in production

	devDatabaseURL    = "postgres://flagon:flagon@localhost:5432/flagon_api?sslmode=disable"         //nolint:gosec // G101: local compose URL, development only
	devAppDatabaseURL = "postgres://flagon_app:flagon_app@localhost:5432/flagon_api?sslmode=disable" //nolint:gosec // G101: local compose URL, development only
)

// defaultDevHost is the bind address when nothing is configured and the server
// is not on Fly: loopback only, so a fresh checkout is never reachable from the
// network (and Windows Firewall never prompts). Containers and Fly bind all
// interfaces by setting FLAGON_HOST=0.0.0.0 (see api/Dockerfile).
const defaultDevHost = "127.0.0.1"

// bindHost is the interface the server binds: the host flag on serve, else
// FLAGON_HOST (so the migrate command classifies the environment the same way).
// Unset, it is loopback off Fly and all interfaces ("") on Fly. The environment
// classification (isProduction) keys off this same value, so a server that binds
// a routable interface can never silently take the development fallbacks.
func bindHost(cmd *cli.Command) string {
	if h := strings.TrimSpace(cmd.String("host")); h != "" {
		return h
	}
	if h := strings.TrimSpace(os.Getenv("FLAGON_HOST")); h != "" {
		return h
	}
	if os.Getenv("FLY_APP_NAME") != "" {
		return ""
	}
	return defaultDevHost
}

// isLoopbackHost reports whether host binds only the local machine
// (127.0.0.0/8, ::1, or "localhost"). Empty means all interfaces, so it is not.
func isLoopbackHost(host string) bool {
	host = strings.Trim(strings.TrimSpace(host), "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// resolveDBConfig builds the two-role connection config. In development an unset
// URL falls back to the local compose database (migrator and app role alike, so
// runtime queries still go through the NOBYPASSRLS app role). In production both
// are required: running runtime queries as the migrator would bypass row-level
// security, so it is a refusal to start, never a warning. The runtime never
// falls back to the migrator role in any environment (see db.Open).
func resolveDBConfig(cmd *cli.Command, requireApp bool) (db.Config, error) {
	cfg := db.Config{
		MigratorURL: strings.TrimSpace(cmd.String("database-url")),
		AppURL:      strings.TrimSpace(cmd.String("app-database-url")),
	}
	if !isProduction(cmd) {
		if cfg.MigratorURL == "" {
			cfg.MigratorURL = devDatabaseURL
		}
		if cfg.AppURL == "" {
			cfg.AppURL = devAppDatabaseURL
		}
		return cfg, nil
	}
	if cfg.MigratorURL == "" {
		return cfg, errors.New("DATABASE_URL is required in production (set FLAGON_ENV=development for local development)")
	}
	if requireApp && cfg.AppURL == "" {
		return cfg, errors.New("FLAGON_APP_DATABASE_URL is required in production: runtime queries must use the NOBYPASSRLS app role, never the migrator (set FLAGON_ENV=development for local development)")
	}
	return cfg, nil
}

// resolveInternalToken returns the shared app<->API secret. The token plus a
// forwarded X-Flagon-User-Id lets the caller act as ANY user, so production has
// no default: an unset token is a refusal to start. Development falls back to
// the public development value, loudly.
func resolveInternalToken(cmd *cli.Command) (string, error) {
	token := strings.TrimSpace(cmd.String("internal-token"))
	if token != "" {
		if isProduction(cmd) && token == devInternalToken {
			return "", errors.New("FLAGON_INTERNAL_TOKEN is set to the public development value; set a real secret in production")
		}
		return token, nil
	}
	if isProduction(cmd) {
		return "", errors.New("FLAGON_INTERNAL_TOKEN is required in production: set a long random secret shared with the app (set FLAGON_ENV=development for local development)")
	}
	slog.Warn("FLAGON_INTERNAL_TOKEN is not set; using the PUBLIC development token. Never expose this server to a network")
	return devInternalToken, nil
}

// newKeyring builds the keyring that seals stored credentials at rest from the
// current key (FLAGON_SECRETS_KEY) and any retired keys
// (FLAGON_SECRETS_KEYS_RETIRED, comma-separated). New values are always sealed
// under the current key; retired keys only decrypt, and sealStoredSecrets
// re-seals every value still under one of them on boot, so a rotation is: set
// the new key, move the old one to the retired list, boot, then drop it.
//
// Production must configure a current key; development falls back to a fixed,
// publicly known key, loudly, so a fresh checkout runs with zero setup.
func newKeyring(primaryRaw, retiredRaw string, production bool) (*secrets.Keyring, error) {
	retired, err := secrets.ParseKeyList(retiredRaw)
	if err != nil {
		return nil, fmt.Errorf("invalid FLAGON_SECRETS_KEYS_RETIRED: %w", err)
	}
	var primary []byte
	if strings.TrimSpace(primaryRaw) == "" {
		if production {
			return nil, errors.New("FLAGON_SECRETS_KEY is required in production: set a base64-encoded 32-byte key (openssl rand -base64 32)")
		}
		slog.Warn("FLAGON_SECRETS_KEY is not set; stored credentials are encrypted with the PUBLIC development key, which is NOT secret. Set FLAGON_SECRETS_KEY before storing real SSO credentials")
		primary = secrets.DevKey
	} else if primary, err = secrets.ParseKey(primaryRaw); err != nil {
		return nil, fmt.Errorf("invalid FLAGON_SECRETS_KEY: %w", err)
	}
	k, err := secrets.NewKeyring(primary, retired...)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(retired))
	for _, r := range retired {
		ids = append(ids, secrets.KeyID(r))
	}
	slog.Info("secrets encryption key loaded", "key_id", k.PrimaryID(), "retired_key_ids", ids)
	return k, nil
}
