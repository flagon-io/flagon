package db

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// TestAuditReadHardening covers migration 0036 against a real database: the
// search never matches an IP the org has not disclosed, and the SECURITY DEFINER
// read window serves rows only to the user bound to the transaction. Skips
// unless FLAGON_TEST_DATABASE_URL is set.
func TestAuditReadHardening(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	alice, bob := "audith-alice-"+u, "audith-bob-"+u
	slug := "audith-co-" + u
	const ip = "203.0.113.77"

	// The org's creation is recorded with a client IP stamped from context.
	withWhere := audit.WithContext(ctx, ip, "NL", "test-agent/1.0")
	if _, err := d.CreateOrg(withWhere, alice, alice+"@example.com", "Audit Hardening", slug); err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	if _, err := d.CreateOrg(ctx, bob, bob+"@example.com", "Bob Co", "audith-bob-"+u); err != nil {
		t.Fatalf("bob CreateOrg: %v", err)
	}
	store := audit.NewStore(d.Pool())

	search := func(q string) []audit.Event {
		t.Helper()
		page, err := store.List(ctx, slug, alice, audit.Filter{Query: q, Limit: 50})
		if err != nil {
			t.Fatalf("List(%q): %v", q, err)
		}
		return page.Events
	}

	// Disclosure off (the default): the IP is hidden AND unsearchable.
	if got := search("203.0.113"); len(got) != 0 {
		t.Fatalf("search by an undisclosed IP matched %d rows; want 0", len(got))
	}
	// The same entry is still found by other fields, with the IP masked.
	all := search("organization")
	if len(all) == 0 {
		t.Fatal("expected the org-created entry to be searchable by its action")
	}
	for _, e := range all {
		if e.ActorIP != nil {
			t.Fatalf("undisclosed IP leaked: %q", *e.ActorIP)
		}
	}

	// Disclosure on: the IP is shown and searchable.
	if err := d.SetAuditConfig(ctx, alice, slug, true); err != nil {
		t.Fatalf("SetAuditConfig: %v", err)
	}
	got := search("203.0.113")
	if len(got) == 0 {
		t.Fatal("search by a disclosed IP matched nothing")
	}
	if got[0].ActorIP == nil || *got[0].ActorIP != ip {
		t.Fatalf("disclosed IP = %v, want %s", got[0].ActorIP, ip)
	}

	// The definer window is bound to the transaction's user: called with alice
	// as p_actor but no user bound (or bob bound), it returns nothing.
	count := func(bound string) int {
		t.Helper()
		tx, err := d.Pool().Begin(ctx)
		if err != nil {
			t.Fatalf("begin: %v", err)
		}
		defer func() { _ = tx.Rollback(ctx) }()
		if bound != "" {
			if _, err := tx.Exec(ctx, "SELECT set_config('flagon.user_id', $1, true)", bound); err != nil {
				t.Fatalf("bind: %v", err)
			}
		}
		var n int
		if err := tx.QueryRow(ctx,
			`SELECT count(*) FROM flagon.org_audit($1, $2, 50, '', NULL, '', NULL, NULL)`,
			alice, slug).Scan(&n); err != nil {
			t.Fatalf("org_audit: %v", err)
		}
		return n
	}
	if n := count(""); n != 0 {
		t.Fatalf("unbound call returned %d rows; want 0", n)
	}
	if n := count(bob); n != 0 {
		t.Fatalf("mismatched bound user returned %d rows; want 0", n)
	}
	if n := count(alice); n == 0 {
		t.Fatal("bound owner saw no rows")
	}
}
