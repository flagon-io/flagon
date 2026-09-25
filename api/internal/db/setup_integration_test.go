package db

import (
	"context"
	"net/url"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"
)

// integrationConfig builds a two-role Config from FLAGON_TEST_DATABASE_URL (a
// migrator/owner connection). The app URL reuses the same host/database with
// the app-role credentials, which Setup provisions. The test is skipped when
// the env var is absent, so `go test ./...` still passes with no database.
func integrationConfig(t *testing.T) Config {
	t.Helper()
	base := os.Getenv("FLAGON_TEST_DATABASE_URL")
	if base == "" {
		t.Skip("set FLAGON_TEST_DATABASE_URL to run database integration tests")
	}
	u, err := url.Parse(base)
	if err != nil {
		t.Fatalf("parse FLAGON_TEST_DATABASE_URL: %v", err)
	}
	appURL := *u
	appURL.User = url.UserPassword("flagon_app", "flagon_app_test_pw")
	return Config{MigratorURL: base, AppURL: appURL.String()}
}

func TestSetupProvisionsMigratesAndEnforcesRLS(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()

	// Setup twice to prove idempotency (provisioning, migrations, grants).
	for i := 0; i < 2; i++ {
		if err := Setup(ctx, cfg); err != nil {
			t.Fatalf("Setup run %d: %v", i+1, err)
		}
	}

	// The runtime pool must be usable as the provisioned app role.
	d := Open(ctx, cfg)
	defer d.Close()
	if err := d.Ping(ctx); err != nil {
		t.Fatalf("app-role Ping: %v", err)
	}

	// The built-in RLS self-check (also served at /internal/rls-check) must pass
	// against the seeded fixture: each org sees only its own row, none sees any.
	report, ok := d.CheckRLS(ctx)
	if !ok {
		t.Fatalf("CheckRLS reports RLS not enforced: %+v", report)
	}

	// The app role must be least-privilege: no superuser, no RLS bypass.
	migrator, err := pgx.Connect(ctx, cfg.MigratorURL)
	if err != nil {
		t.Fatalf("connect migrator: %v", err)
	}
	defer func() { _ = migrator.Close(ctx) }()
	// Mirror how Setup runs migrations, so the fixture table lands in public.
	if _, err := migrator.Exec(ctx, "SET search_path TO public"); err != nil {
		t.Fatalf("set search_path: %v", err)
	}

	var superuser, bypassRLS bool
	if err := migrator.QueryRow(ctx,
		`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'flagon_app'`,
	).Scan(&superuser, &bypassRLS); err != nil {
		t.Fatalf("read app role attributes: %v", err)
	}
	if superuser {
		t.Error("app role is SUPERUSER; must not be")
	}
	if bypassRLS {
		t.Error("app role has BYPASSRLS; must not be")
	}

	// The migration must have created the tenant-context helper.
	var orgIsNull bool
	if err := migrator.QueryRow(ctx, `SELECT flagon.current_org() IS NULL`).Scan(&orgIsNull); err != nil {
		t.Fatalf("flagon.current_org() missing: %v", err)
	}
	if !orgIsNull {
		t.Error("flagon.current_org() should be NULL when unset")
	}

	// End-to-end RLS: an org-scoped table only ever shows the caller's org to
	// the app role, even though the row was written by the owner.
	orgA := "00000000-0000-0000-0000-00000000000a"
	orgB := "00000000-0000-0000-0000-00000000000b"
	setupRLSFixture(t, ctx, migrator, orgA, orgB)
	defer func() {
		if _, err := migrator.Exec(ctx, `DROP TABLE IF EXISTS rls_probe`); err != nil {
			t.Errorf("drop rls_probe: %v", err)
		}
	}()

	// Re-grant so the freshly created table is visible to the app role (in real
	// life this table would arrive via a migration, before Setup's grant step).
	if err := grantAppRole(ctx, migrator, "flagon_app"); err != nil {
		t.Fatalf("grant app role: %v", err)
	}

	app, err := pgx.Connect(ctx, cfg.AppURL)
	if err != nil {
		t.Fatalf("connect app role: %v", err)
	}
	defer func() { _ = app.Close(ctx) }()

	if got := visibleRows(t, ctx, app, orgA); got != 1 {
		t.Errorf("org A sees %d rows, want 1 (RLS not enforced)", got)
	}
	if got := visibleRows(t, ctx, app, orgB); got != 1 {
		t.Errorf("org B sees %d rows, want 1 (RLS not enforced)", got)
	}
}

func setupRLSFixture(t *testing.T, ctx context.Context, conn *pgx.Conn, orgA, orgB string) {
	t.Helper()
	stmts := `
		DROP TABLE IF EXISTS rls_probe;
		CREATE TABLE rls_probe (id serial PRIMARY KEY, org_id uuid NOT NULL, val text);
		ALTER TABLE rls_probe ENABLE ROW LEVEL SECURITY;
		ALTER TABLE rls_probe FORCE ROW LEVEL SECURITY;
		CREATE POLICY rls_probe_iso ON rls_probe
			USING (org_id = flagon.current_org())
			WITH CHECK (org_id = flagon.current_org());
		INSERT INTO rls_probe (org_id, val) VALUES ('` + orgA + `', 'a'), ('` + orgB + `', 'b');`
	if _, err := conn.PgConn().Exec(ctx, stmts).ReadAll(); err != nil {
		t.Fatalf("build RLS fixture: %v", err)
	}
}

func visibleRows(t *testing.T, ctx context.Context, conn *pgx.Conn, org string) int {
	t.Helper()
	if _, err := conn.Exec(ctx, `SELECT set_config('flagon.org_id', $1, false)`, org); err != nil {
		t.Fatalf("set tenant context: %v", err)
	}
	var n int
	if err := conn.QueryRow(ctx, `SELECT count(*) FROM rls_probe`).Scan(&n); err != nil {
		t.Fatalf("count rows: %v", err)
	}
	return n
}

func TestMigrationsAreImmutableOnceApplied(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()

	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}

	conn, err := pgx.Connect(ctx, cfg.MigratorURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()

	// Simulate a shipped migration being edited after the fact by corrupting
	// its recorded checksum, then confirm the runner refuses to proceed.
	if _, err := conn.Exec(ctx, `UPDATE schema_migrations SET checksum = 'tampered' WHERE version = '0001_tenant_context'`); err != nil {
		t.Fatalf("corrupt checksum: %v", err)
	}
	defer func() {
		if _, err := conn.Exec(ctx, `DELETE FROM schema_migrations WHERE checksum = 'tampered'`); err != nil {
			t.Errorf("restore tampered migration: %v", err)
		}
	}()

	if err := runMigrations(ctx, conn); err == nil {
		t.Fatal("expected runMigrations to fail on modified migration, got nil")
	}
}
