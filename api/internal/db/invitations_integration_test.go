package db

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// Accepting an invitation is an org mutation (a new member), so it must land an
// audit entry atomically with the membership; and the definer windows touched by
// migration 0030 must honor the transaction's bound user. Skips unless
// FLAGON_TEST_DATABASE_URL is set.
func TestAcceptInvitationIsAuditedAndDefinersBindTheCaller(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	alice, aliceEmail := "inv-alice-"+u, "inv-alice-"+u+"@example.com"
	carol, carolEmail := "inv-carol-"+u, "inv-carol-"+u+"@example.com"
	slug := "inv-co-" + u

	org, err := d.CreateOrg(ctx, alice, aliceEmail, "Invite Co", slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}

	// IsOrgMember: true for the owner, false for a stranger and for junk ids.
	if ok, err := d.IsOrgMember(ctx, alice, org.ID); err != nil || !ok {
		t.Fatalf("IsOrgMember(alice) = %v, %v; want true", ok, err)
	}
	if ok, err := d.IsOrgMember(ctx, carol, org.ID); err != nil || ok {
		t.Fatalf("IsOrgMember(carol) = %v, %v; want false before joining", ok, err)
	}
	if ok, err := d.IsOrgMember(ctx, alice, "not-a-uuid"); err != nil || ok {
		t.Fatalf("IsOrgMember(junk id) = %v, %v; want false, nil", ok, err)
	}

	res, err := d.InviteMember(ctx, alice, slug, carolEmail, RoleMember)
	if err != nil || res.Status != "invited" {
		t.Fatalf("InviteMember = %+v, %v; want a pending invitation", res, err)
	}

	// The list windows now run inside the caller's user transaction.
	invites, _, err := d.ListInvitations(ctx, alice, slug, paginate.Query{})
	if err != nil || len(invites) != 1 {
		t.Fatalf("ListInvitations = %d, %v; want 1", len(invites), err)
	}

	gotSlug, _, invitedBy, err := d.AcceptInvitation(ctx, carol, carolEmail, res.Token)
	if err != nil {
		t.Fatalf("AcceptInvitation: %v", err)
	}
	if gotSlug != slug || invitedBy != alice {
		t.Fatalf("AcceptInvitation = (%q, invitedBy %q), want (%q, %q)", gotSlug, invitedBy, slug, alice)
	}

	members, _, err := d.ListMembers(ctx, alice, slug, paginate.Query{})
	if err != nil || len(members) != 2 {
		t.Fatalf("ListMembers = %d, %v; want 2 after acceptance", len(members), err)
	}

	events, err := d.ListAuditLog(ctx, alice, slug, 50)
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	found := false
	for _, e := range events {
		if e.Action == string(audit.ActionInvitationAccepted) && e.ActorID != nil && *e.ActorID == carol {
			found = true
		}
	}
	if !found {
		t.Fatalf("accepting an invitation wrote no %q audit entry by the accepter", audit.ActionInvitationAccepted)
	}

	// The definer windows trust the bound user, not the argument: asking for
	// alice's members while bound as someone else (or unbound) sees nothing.
	for _, bound := range []string{"", carol + "-impostor"} {
		n, err := countDefinerRows(ctx, d, bound, alice, slug)
		if err != nil {
			t.Fatalf("org_members bound as %q: %v", bound, err)
		}
		if n != 0 {
			t.Fatalf("DEFINER LEAK: org_members(p_actor=alice) bound as %q returned %d rows", bound, n)
		}
	}

	// accept_invitation refuses an accepting user who is not the bound user.
	res2, err := d.InviteMember(ctx, alice, slug, "inv-dave-"+u+"@example.com", RoleMember)
	if err != nil {
		t.Fatalf("second InviteMember: %v", err)
	}
	err = d.inUserTx(ctx, "someone-else-"+u, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `SELECT * FROM flagon.accept_invitation($1, $2, $3)`,
			"inv-dave-"+u, "inv-dave-"+u+"@example.com", hashToken(res2.Token))
		return mapAcceptErr(err)
	})
	if !errors.Is(err, ErrForbidden) {
		t.Fatalf("accept_invitation for a user other than the bound one = %v, want ErrForbidden", err)
	}
}

// countDefinerRows calls flagon.org_members for actor while the transaction is
// bound to `bound` ("" = no user bound).
func countDefinerRows(ctx context.Context, d *DB, bound, actor, slug string) (int, error) {
	ctx, cancel := withQueryTimeout(ctx)
	defer cancel()
	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if bound != "" {
		if _, err := tx.Exec(ctx, "SELECT set_config('flagon.user_id', $1, true)", bound); err != nil {
			return 0, err
		}
	}
	var n int
	err = tx.QueryRow(ctx,
		`SELECT count(*) FROM flagon.org_members($1, $2, '', 100, NULL)`, actor, slug).Scan(&n)
	return n, err
}
