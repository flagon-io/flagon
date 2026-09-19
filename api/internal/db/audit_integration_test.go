package db

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// Exercises the audit WRITE path end to end (record_audit inside each mutation's
// tx) and the READ gate (org_audit, owner/admin only), against a real database.
// It complements audit.TestActionsComplete (which only checks the constant set)
// by proving org-state mutations actually land entries and that the log is
// tenant-isolated. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestAuditRecordsOrgMutationsAndIsIsolated(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	// Unique ids + emails per run so tests sharing one CI database (and -shuffle)
	// never collide on a login email.
	u := unique(t)
	alice, bob := "audit-alice-"+u, "audit-bob-"+u
	aliceEmail, bobEmail := "audit-alice-"+u+"@example.com", "audit-bob-"+u+"@example.com"

	// Bob needs a user row before alice can add him by email; giving him his own
	// org creates it (and sets up the cross-tenant check below).
	bobSlug := "bob-co-" + u
	if _, err := d.CreateOrg(ctx, bob, bobEmail, "Bob Co", bobSlug); err != nil {
		t.Fatalf("bob CreateOrg: %v", err)
	}

	slug := "audit-co-" + u
	if _, err := d.CreateOrg(ctx, alice, aliceEmail, "Audit Co", slug); err != nil {
		t.Fatalf("alice CreateOrg: %v", err)
	}

	// An org token: create then revoke - both auditable.
	_, tokID, err := d.CreateOAT(ctx, alice, slug, "ci-token", "admin", nil, nil)
	if err != nil {
		t.Fatalf("CreateOAT: %v", err)
	}
	if err := d.RevokeOAT(ctx, alice, tokID); err != nil {
		t.Fatalf("RevokeOAT: %v", err)
	}

	// A membership change: add bob, then bob leaves.
	if _, _, err := d.AddMember(ctx, alice, slug, bobEmail, "member"); err != nil {
		t.Fatalf("AddMember: %v", err)
	}
	if err := d.LeaveOrg(ctx, bob, slug); err != nil {
		t.Fatalf("LeaveOrg: %v", err)
	}

	events, err := d.ListAuditLog(ctx, alice, slug, 50)
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	got := map[string]bool{}
	for _, e := range events {
		got[e.Action] = true
	}
	for _, want := range []audit.Action{
		audit.ActionOrgCreated,
		audit.ActionTokenCreated,
		audit.ActionTokenRevoked,
		audit.ActionMemberAdded,
		audit.ActionMemberLeft,
	} {
		if !got[string(want)] {
			t.Errorf("audit log missing action %q", want)
		}
	}

	// Cross-tenant isolation: bob's own org never surfaces alice's entries...
	bobEvents, err := d.ListAuditLog(ctx, bob, bobSlug, 50)
	if err != nil {
		t.Fatalf("bob ListAuditLog: %v", err)
	}
	for _, e := range bobEvents {
		if e.TargetID != nil && *e.TargetID == tokID {
			t.Fatalf("AUDIT LEAK: bob sees alice's token event in his own org log")
		}
	}

	// ...and bob (now a non-member of alice's org) reads zero rows from it, since
	// org_audit gates on an owner/admin membership.
	leak, err := d.ListAuditLog(ctx, bob, slug, 50)
	if err != nil {
		t.Fatalf("bob ListAuditLog(alice's org): %v", err)
	}
	if len(leak) != 0 {
		t.Fatalf("AUDIT LEAK: non-member bob read %d events from alice's org", len(leak))
	}
}
