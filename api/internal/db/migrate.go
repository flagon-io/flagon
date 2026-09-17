package db

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// migrationsFS holds the forward-only SQL migrations, applied in filename
// order. Each file is one migration; do NOT put transaction control (BEGIN /
// COMMIT) inside them - the runner wraps every migration in its own
// transaction together with its bookkeeping row, so a migration either fully
// applies or not at all.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

const migrationsDir = "migrations"

// runMigrations applies every not-yet-applied migration in order. A migration
// error, or a checksum mismatch on an already-applied migration (i.e. a
// shipped file was edited after the fact), is returned as a hard error so the
// caller can refuse to start - we never serve against a half-known schema.
func runMigrations(ctx context.Context, conn *pgx.Conn) error {
	// Pin the search path so unqualified DDL in migration bodies lands in
	// public regardless of the migrator role's name (see Setup for the full
	// rationale). The bookkeeping table below is qualified explicitly, so it is
	// unaffected either way.
	if _, err := conn.Exec(ctx, "SET search_path TO public"); err != nil {
		return fmt.Errorf("set search_path: %w", err)
	}

	if err := ensureMigrationsTable(ctx, conn); err != nil {
		return fmt.Errorf("create public.schema_migrations: %w", err)
	}

	applied, err := appliedChecksums(ctx, conn)
	if err != nil {
		return fmt.Errorf("read applied migrations: %w", err)
	}

	files, err := migrationFiles()
	if err != nil {
		return err
	}

	for _, name := range files {
		body, err := migrationsFS.ReadFile(migrationsDir + "/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		version := strings.TrimSuffix(name, ".sql")
		sum := checksum(body)

		if prev, ok := applied[version]; ok {
			if prev != sum {
				return fmt.Errorf("migration %s was modified after being applied (recorded %s, now %s); migrations are immutable once shipped", version, short(prev), short(sum))
			}
			continue
		}

		if err := applyMigration(ctx, conn, version, sum, string(body)); err != nil {
			return fmt.Errorf("apply migration %s: %w", version, err)
		}
	}
	return nil
}

func ensureMigrationsTable(ctx context.Context, conn *pgx.Conn) error {
	_, err := conn.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.schema_migrations (
			version    text PRIMARY KEY,
			checksum   text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`)
	return err
}

func appliedChecksums(ctx context.Context, conn *pgx.Conn) (map[string]string, error) {
	rows, err := conn.Query(ctx, `SELECT version, checksum FROM public.schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[string]string{}
	for rows.Next() {
		var version, sum string
		if err := rows.Scan(&version, &sum); err != nil {
			return nil, err
		}
		out[version] = sum
	}
	return out, rows.Err()
}

// applyMigration runs one migration and records it in a single transaction. The
// migration body may contain many statements (function bodies, multiple DDL),
// so it is executed via the simple query protocol; the bookkeeping insert runs
// on the same transaction so the two commit or roll back together.
func applyMigration(ctx context.Context, conn *pgx.Conn, version, sum, body string) error {
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Conn().PgConn().Exec(ctx, body).ReadAll(); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)`,
		version, sum,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func migrationFiles() ([]string, error) {
	entries, err := fs.ReadDir(migrationsFS, migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("read migrations dir: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

func checksum(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func short(sum string) string {
	if len(sum) > 12 {
		return sum[:12]
	}
	return sum
}
