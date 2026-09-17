package db

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// connectAttempts / connectBackoff bound how long Setup waits for Postgres to
// answer before declaring it unavailable. Managed Postgres can be briefly
// unreachable right as a machine starts, so we retry, but only long enough to
// ride out a start-up blip - not so long that a truly down database stalls the
// deploy.
const (
	connectAttempts = 6
	connectBackoff  = 2 * time.Second
	connectTimeout  = 10 * time.Second
)

// Setup provisions the app role, runs migrations, and grants the app role its
// runtime privileges - the whole "make the schema match the code" step that
// must happen on every deploy.
//
// The error contract is deliberate:
//
//   - If Postgres cannot be reached, Setup returns an error wrapping
//     ErrUnavailable. The caller should log loudly and START ANYWAY (degraded).
//   - If Postgres IS reachable but a migration fails or was tampered with,
//     Setup returns a plain error. The caller should treat that as fatal and
//     refuse to start, so a broken schema never ships.
//   - Role provisioning and grants are best-effort: they log loudly on failure
//     but do not block startup, since the outcome (queries failing) is already
//     surfaced by readiness.
func Setup(ctx context.Context, cfg Config) error {
	if cfg.MigratorURL == "" {
		return fmt.Errorf("%w: DATABASE_URL is not set", ErrUnavailable)
	}

	conn, err := connectWithRetry(ctx, cfg.MigratorURL)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUnavailable, err)
	}
	defer conn.Close(ctx)

	role, password, roleErr := appRoleCredentials(cfg.AppURL)
	if cfg.AppURL == "" {
		slog.Warn("FLAGON_APP_DATABASE_URL not set; skipping app-role provisioning, runtime falls back to the migrator role with NO tenant isolation")
	} else if roleErr != nil {
		slog.Warn("cannot provision app role from FLAGON_APP_DATABASE_URL", "err", roleErr)
	} else if err := provisionAppRole(ctx, conn, role, password); err != nil {
		if isDBManagedRole(err) {
			slog.Info("app role is managed by the database; leaving its password/attributes to the platform", "role", role)
		} else {
			slog.Warn("could not provision app role; runtime database access may fail", "role", role, "err", err)
		}
	}

	// Migrations are the deploy gate: any failure here is fatal to the caller.
	if err := runMigrations(ctx, conn); err != nil {
		return err
	}

	if roleErr == nil && cfg.AppURL != "" {
		if err := grantAppRole(ctx, conn, role); err != nil {
			if isDBManagedRole(err) {
				slog.Info("grants for app role are managed by the database; the platform's role model already covers it", "role", role)
			} else {
				slog.Warn("could not grant runtime privileges to app role", "role", role, "err", err)
			}
		}
	}
	return nil
}

// isDBManagedRole reports whether err is the database refusing a role or grant
// change because it manages roles itself (Fly Managed Postgres and similar) -
// an expected, non-fatal condition, not a misconfiguration. Such platforms
// return insufficient_privilege (42501) for ALTER ROLE / GRANT on their roles.
func isDBManagedRole(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42501"
}

func connectWithRetry(ctx context.Context, url string) (*pgx.Conn, error) {
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	// Migrations run through Managed Postgres' transaction-pooling pgbouncer,
	// which does not tolerate pgx's default extended-protocol / prepared-
	// statement path for DDL - it can hang mid-migration. The simple protocol
	// avoids prepared statements entirely, so DDL behaves the same as psql.
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	var lastErr error
	for attempt := 1; attempt <= connectAttempts; attempt++ {
		// Bound each connect so a network black-hole fails fast rather than
		// hanging the release command (and thus the whole deploy) indefinitely.
		attemptCtx, cancel := context.WithTimeout(ctx, connectTimeout)
		conn, err := pgx.ConnectConfig(attemptCtx, cfg)
		if err == nil {
			if err = conn.Ping(attemptCtx); err == nil {
				cancel()
				return conn, nil
			}
			_ = conn.Close(attemptCtx)
		}
		cancel()
		lastErr = err
		if attempt < connectAttempts {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(connectBackoff):
			}
		}
	}
	return nil, lastErr
}

var identRe = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

// appRoleCredentials extracts the role name and password from the app URL. The
// role name must be a plain SQL identifier; anything else is rejected rather
// than escaped into DDL, closing off any injection path through the URL.
func appRoleCredentials(appURL string) (role, password string, err error) {
	if appURL == "" {
		return "", "", errors.New("FLAGON_APP_DATABASE_URL is not set")
	}
	cfg, err := pgconn.ParseConfig(appURL)
	if err != nil {
		return "", "", fmt.Errorf("parse FLAGON_APP_DATABASE_URL: %w", err)
	}
	if cfg.User == "" {
		return "", "", errors.New("FLAGON_APP_DATABASE_URL has no user")
	}
	if !identRe.MatchString(cfg.User) || len(cfg.User) > 63 {
		return "", "", fmt.Errorf("app role %q is not a valid postgres identifier", cfg.User)
	}
	if cfg.Password == "" {
		return "", "", errors.New("FLAGON_APP_DATABASE_URL has no password")
	}
	return cfg.User, cfg.Password, nil
}

// provisionAppRole ensures the app role exists and its password matches the one
// in FLAGON_APP_DATABASE_URL, then pins its attributes. NOBYPASSRLS is the load
// -bearing one: it guarantees the runtime role is always subject to row-level
// security, even on tables it was granted access to.
func provisionAppRole(ctx context.Context, conn *pgx.Conn, role, password string) error {
	ident := quoteIdent(role)

	create := fmt.Sprintf(`DO $flagon$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = %s) THEN
		CREATE ROLE %s LOGIN;
	END IF;
END
$flagon$;`, quoteLiteral(role), ident)
	if _, err := conn.Exec(ctx, create); err != nil {
		return err
	}

	alter := fmt.Sprintf(
		`ALTER ROLE %s WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %s`,
		ident, quoteLiteral(password),
	)
	_, err := conn.Exec(ctx, alter)
	return err
}

// grantAppRole gives the app role least-privilege runtime access to every user
// schema, and sets default privileges so tables created by future migrations
// are covered automatically. Idempotent - it runs on every boot.
func grantAppRole(ctx context.Context, conn *pgx.Conn, role string) error {
	schemas, err := userSchemas(ctx, conn)
	if err != nil {
		return err
	}
	ident := quoteIdent(role)
	for _, schema := range schemas {
		s := quoteIdent(schema)
		stmts := []string{
			fmt.Sprintf(`GRANT USAGE ON SCHEMA %s TO %s`, s, ident),
			fmt.Sprintf(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %s TO %s`, s, ident),
			fmt.Sprintf(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %s TO %s`, s, ident),
			fmt.Sprintf(`ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %s`, s, ident),
			fmt.Sprintf(`ALTER DEFAULT PRIVILEGES IN SCHEMA %s GRANT USAGE, SELECT ON SEQUENCES TO %s`, s, ident),
		}
		for _, stmt := range stmts {
			if _, err := conn.Exec(ctx, stmt); err != nil {
				return err
			}
		}
	}
	return nil
}

func userSchemas(ctx context.Context, conn *pgx.Conn) ([]string, error) {
	rows, err := conn.Query(ctx, `
		SELECT nspname FROM pg_namespace
		WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var schemas []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		schemas = append(schemas, name)
	}
	return schemas, rows.Err()
}

func quoteIdent(s string) string {
	return `"` + strings.ReplaceAll(s, `"`, `""`) + `"`
}

func quoteLiteral(s string) string {
	return `'` + strings.ReplaceAll(s, `'`, `''`) + `'`
}
