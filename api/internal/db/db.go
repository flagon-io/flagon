// Package db owns the Flagon API's Postgres access. It deliberately separates
// two roles so a running server can never quietly gain schema power:
//
//   - The MIGRATOR role (DATABASE_URL) owns the schema. It is used ONLY at
//     boot, to provision the app role and run migrations. The HTTP server
//     never queries with it.
//   - The APP role (FLAGON_APP_DATABASE_URL) is a least-privilege, NOBYPASSRLS
//     login used for every runtime query. Because it cannot bypass row-level
//     security, tenant isolation holds even if application code forgets to
//     scope a query.
//
// Connecting is lazy and failure-tolerant: if Postgres is unreachable the
// process still starts (locally and in production) so a database blip cannot
// take down the deploy, but readiness (/readyz) reports the outage loudly.
package db

import (
	"context"
	"errors"
	"log"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrUnavailable means Postgres is not reachable or not configured. It is a
// degraded-but-running condition, never a reason to abort startup.
var ErrUnavailable = errors.New("database unavailable")

// Config holds the two connection strings that drive the two-role model.
type Config struct {
	// MigratorURL (DATABASE_URL) is the schema owner used for migrations and
	// for provisioning the app role. On Fly Managed Postgres this is set
	// automatically when a cluster is attached.
	MigratorURL string

	// AppURL (FLAGON_APP_DATABASE_URL) is the RLS-enforced runtime role. Its
	// user + password also drive app-role provisioning at boot, so the
	// credential lives in exactly one place: this environment variable.
	AppURL string
}

// ConfigFromEnv reads the connection strings from the environment.
func ConfigFromEnv() Config {
	return Config{
		MigratorURL: os.Getenv("DATABASE_URL"),
		AppURL:      os.Getenv("FLAGON_APP_DATABASE_URL"),
	}
}

// DB is the runtime database handle used by the HTTP server. A nil pool is a
// valid, fully constructed DB: it simply reports ErrUnavailable until Postgres
// is configured and reachable.
type DB struct {
	pool *pgxpool.Pool
}

// Open builds the runtime pool from the app (RLS) role. It never dials here -
// pgxpool connects lazily on first use - so a down or misconfigured database
// yields a usable handle that fails loudly at query/ping time rather than
// preventing the server from starting.
func Open(ctx context.Context, cfg Config) *DB {
	url := cfg.AppURL
	if url == "" {
		// No RLS role configured. Fall back to the migrator URL so local dev
		// still works, but make the loss of isolation impossible to miss.
		if cfg.MigratorURL != "" {
			log.Printf("WARNING: FLAGON_APP_DATABASE_URL is not set; runtime queries will use the migrator role, which BYPASSES tenant isolation. Set it before production.")
		}
		url = cfg.MigratorURL
	}
	if url == "" {
		log.Printf("WARNING: no database configured (DATABASE_URL / FLAGON_APP_DATABASE_URL); starting in degraded mode.")
		return &DB{}
	}

	poolCfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		log.Printf("WARNING: invalid database URL, starting in degraded mode: %v", err)
		return &DB{}
	}
	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		log.Printf("WARNING: could not build database pool, starting in degraded mode: %v", err)
		return &DB{}
	}
	return &DB{pool: pool}
}

// Pool exposes the underlying pool for query code. It is nil when the database
// is unconfigured; callers that touch it must handle that (or call Ping first).
func (d *DB) Pool() *pgxpool.Pool { return d.pool }

// Ping reports whether the database is reachable right now. It is the probe
// behind /readyz, so it uses a short timeout to keep readiness responsive.
func (d *DB) Ping(ctx context.Context) error {
	if d == nil || d.pool == nil {
		return ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	if err := d.pool.Ping(ctx); err != nil {
		return errors.Join(ErrUnavailable, err)
	}
	return nil
}

// Close releases the pool. Safe to call on a degraded (nil-pool) handle.
func (d *DB) Close() {
	if d != nil && d.pool != nil {
		d.pool.Close()
	}
}
