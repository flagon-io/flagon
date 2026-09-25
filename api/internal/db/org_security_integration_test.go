package db

import (
	"context"
	"errors"
	"testing"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// Covers the org security policy: default off, owner can toggle it (audited), the
// change surfaces on the org object (so the app gate sees it), and a non-admin
// member cannot change it. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestOrgSecurityPolicy(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	owner, member := "sec-owner-"+u, "sec-member-"+u
	ownerEmail, memberEmail := "sec-owner-"+u+"@example.com", "sec-member-"+u+"@example.com"

	// Member needs a user row first (so the owner can add them).
	if _, err := d.CreateOrg(ctx, member, memberEmail, "Member Co", "member-co-"+u); err != nil {
		t.Fatalf("member CreateOrg: %v", err)
	}

	slug := "sec-co-" + u
	org, err := d.CreateOrg(ctx, owner, ownerEmail, "Sec Co", slug)
	if err != nil {
		t.Fatalf("owner CreateOrg: %v", err)
	}
	if org.EnforceTwoFactor {
		t.Fatalf("new org should default to enforce_two_factor=false")
	}

	// Default policy is off.
	s, err := d.GetOrgSecurity(ctx, owner, slug)
	if err != nil {
		t.Fatalf("GetOrgSecurity: %v", err)
	}
	if s.EnforceTwoFactor {
		t.Fatalf("default EnforceTwoFactor should be false")
	}

	// Default base permission is read (GitHub's default).
	if s.BasePermission != "read" {
		t.Fatalf("default base_permission = %q, want read", s.BasePermission)
	}

	// Owner enables 2FA and raises the base permission to write. The self-lockout
	// guard needs the owner's own 2FA on first (see TestOrgAccessEnforcement).
	on := true
	if err := d.SetUserAuthState(ctx, owner, ownerEmail, &on, nil); err != nil {
		t.Fatalf("SetUserAuthState: %v", err)
	}
	if err := d.SetOrgSecurity(ctx, owner, slug, OrgSecurity{EnforceTwoFactor: true, BasePermission: "write"}); err != nil {
		t.Fatalf("SetOrgSecurity: %v", err)
	}
	s, err = d.GetOrgSecurity(ctx, owner, slug)
	if err != nil {
		t.Fatalf("GetOrgSecurity after set: %v", err)
	}
	if !s.EnforceTwoFactor {
		t.Fatalf("EnforceTwoFactor should be true after enabling")
	}
	if s.BasePermission != "write" {
		t.Fatalf("base_permission = %q, want write", s.BasePermission)
	}

	// An invalid base permission is rejected.
	if err := d.SetOrgSecurity(ctx, owner, slug, OrgSecurity{BasePermission: "superuser"}); !errors.Is(err, ErrInvalidBasePermission) {
		t.Fatalf("invalid base permission err = %v, want ErrInvalidBasePermission", err)
	}

	// It surfaces on the org object (what the app gate reads via Me).
	_, orgs, err := d.Me(ctx, owner, ownerEmail)
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	var found bool
	for _, o := range orgs {
		if o.Slug == slug {
			found = true
			if !o.EnforceTwoFactor {
				t.Fatalf("org object should carry enforce_two_factor=true")
			}
		}
	}
	if !found {
		t.Fatalf("owner's org list missing %s", slug)
	}

	// The change is audited.
	events, err := d.ListAuditLog(ctx, owner, slug, 50)
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	var sawSecurity bool
	for _, e := range events {
		if e.Action == string(audit.ActionOrgSecurity) {
			sawSecurity = true
		}
	}
	if !sawSecurity {
		t.Fatalf("audit log missing %q", audit.ActionOrgSecurity)
	}

	// A non-admin member cannot change the policy.
	if _, _, err := d.AddMember(ctx, owner, slug, memberEmail, "member"); err != nil {
		t.Fatalf("AddMember: %v", err)
	}
	if err := d.SetOrgSecurity(ctx, member, slug, OrgSecurity{EnforceTwoFactor: false}); !errors.Is(err, ErrForbidden) {
		t.Fatalf("member SetOrgSecurity err = %v, want ErrForbidden", err)
	}
}
