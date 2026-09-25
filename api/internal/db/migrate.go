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

// migrationsFS holds the forward-only SQL migrations, applied in filename order.
// Each file is one migration; do NOT put transaction control (BEGIN / COMMIT)
// inside them - the whole run happens in a single transaction, so either every
// pending migration applies or none does.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

const migrationsDir = "migrations"

// migrationAdvisoryLock is a fixed key every migrator locks on, so concurrent
// migrators (e.g. several machines booting at once) serialize instead of racing
// to create the same objects.
const migrationAdvisoryLock int64 = 4_972_011

// runMigrations applies every not-yet-applied migration in order, in one
// transaction guarded by a transaction-scoped advisory lock. The lock makes
// concurrent boots safe: the first migrator applies while the rest wait, then
// find nothing to do. A transaction-scoped lock (not session) is what works
// through a transaction-pooling connection (pgbouncer) and frees on commit.
//
// A migration error, or a checksum mismatch on an already-applied migration
// (i.e. a shipped file was edited after the fact), rolls the whole run back and
// returns a hard error, so we never serve against a half-known schema.
func runMigrations(ctx context.Context, conn *pgx.Conn) error {
	// Pin the search path so unqualified DDL in migration bodies lands in
	// public regardless of the migrator role's name. Bookkeeping is qualified
	// explicitly, so it is unaffected either way.
	if _, err := conn.Exec(ctx, "SET search_path TO public"); err != nil {
		return fmt.Errorf("set search_path: %w", err)
	}

	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op (ErrTxClosed) after Commit

	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock($1)", migrationAdvisoryLock); err != nil {
		return fmt.Errorf("acquire migration lock: %w", err)
	}

	if err := ensureMigrationsTable(ctx, tx); err != nil {
		return fmt.Errorf("create public.schema_migrations: %w", err)
	}

	applied, err := appliedChecksums(ctx, tx)
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

		if err := applyMigration(ctx, tx, version, sum, string(body)); err != nil {
			return fmt.Errorf("apply migration %s: %w", version, err)
		}
	}

	return tx.Commit(ctx)
}

func ensureMigrationsTable(ctx context.Context, tx pgx.Tx) error {
	_, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS public.schema_migrations (
			version    text PRIMARY KEY,
			checksum   text NOT NULL,
			applied_at timestamptz NOT NULL DEFAULT now()
		)`)
	return err
}

func appliedChecksums(ctx context.Context, tx pgx.Tx) (map[string]string, error) {
	rows, err := tx.Query(ctx, `SELECT version, checksum FROM public.schema_migrations`)
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

// applyMigration runs one migration's body and records it, within the caller's
// transaction. The body may contain many statements (function bodies, multiple
// DDL), so it is executed via the simple query protocol.
func applyMigration(ctx context.Context, tx pgx.Tx, version, sum, body string) error {
	if _, err := tx.Conn().PgConn().Exec(ctx, body).ReadAll(); err != nil {
		return err
	}
	_, err := tx.Exec(ctx,
		`INSERT INTO public.schema_migrations (version, checksum) VALUES ($1, $2)`,
		version, sum,
	)
	return err
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
