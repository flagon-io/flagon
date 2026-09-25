package db

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/paginate"
)

// The teams and team-members definer windows (migration 0037) trust the
// transaction's bound user, not the actor argument: the Go callers still list
// normally, but a call claiming to be a member while bound as someone else (or
// unbound) sees nothing. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestTeamDefinersBindTheCaller(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	alice, aliceEmail := "team-alice-"+u, "team-alice-"+u+"@example.com"
	slug := "team-co-" + u
	if _, err := d.CreateOrg(ctx, alice, aliceEmail, "Team Co", slug); err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	if _, err := d.CreateTeam(ctx, alice, slug, TeamInput{Name: "Platform", Slug: "platform"}); err != nil {
		t.Fatalf("CreateTeam: %v", err)
	}

	// The real callers run inside inUserTx, so they keep working.
	teams, _, err := d.ListTeams(ctx, alice, slug, paginate.Query{})
	if err != nil || len(teams) != 1 {
		t.Fatalf("ListTeams = %d, %v; want 1", len(teams), err)
	}
	members, _, err := d.ListTeamMembers(ctx, alice, slug, "platform", paginate.Query{})
	if err != nil || len(members) != 1 {
		t.Fatalf("ListTeamMembers = %d, %v; want 1 (the creating maintainer)", len(members), err)
	}

	queries := map[string]string{
		"teams":        `SELECT count(*) FROM flagon.teams($1, $2, '', 100, NULL)`,
		"team_members": `SELECT count(*) FROM flagon.team_members($1, $2, 'platform', '', 100, NULL)`,
	}
	for name, q := range queries {
		// Bound as alice: the window answers.
		if n := countBoundRows(ctx, t, d, alice, q, alice, slug); n != 1 {
			t.Fatalf("%s(p_actor=alice) bound as alice = %d rows, want 1", name, n)
		}
		// Bound as anyone else, or unbound: nothing, whatever p_actor claims.
		for _, bound := range []string{"", "team-mallory-" + u} {
			if n := countBoundRows(ctx, t, d, bound, q, alice, slug); n != 0 {
				t.Fatalf("DEFINER LEAK: %s(p_actor=alice) bound as %q returned %d rows", name, bound, n)
			}
		}
	}
}

// countBoundRows runs a count query with the transaction bound to `bound` ("" =
// no user bound).
func countBoundRows(ctx context.Context, t *testing.T, d *DB, bound, query string, args ...any) int {
	t.Helper()
	ctx, cancel := withQueryTimeout(ctx)
	defer cancel()
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if bound != "" {
		if _, err := tx.Exec(ctx, "SELECT set_config('flagon.user_id', $1, true)", bound); err != nil {
			t.Fatalf("bind user: %v", err)
		}
	}
	var n int
	if err := tx.QueryRow(ctx, query, args...).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	return n
}
