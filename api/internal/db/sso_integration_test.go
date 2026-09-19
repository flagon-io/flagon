package db

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// Verifies SSO provisioning: a user authenticated through an org's IdP is added as
// a member (creating their domain user row on the way), the join is audited, and a
// repeat call is idempotent. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestProvisionSSOMember(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	owner := "sso-owner-" + u
	slug := "sso-co-" + u
	org, err := d.CreateOrg(ctx, owner, "sso-owner-"+u+"@example.com", "SSO Co", slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}

	// A brand-new SSO user with no prior domain row.
	ssoUser := "sso-newcomer-" + u
	if err := d.ProvisionSSOMember(ctx, org.ID, ssoUser, "newcomer-"+u+"@acme.com", "member"); err != nil {
		t.Fatalf("ProvisionSSOMember: %v", err)
	}

	// They now see the org (membership provisioned + user row created).
	_, orgs, err := d.Me(ctx, ssoUser, "newcomer-"+u+"@acme.com")
	if err != nil {
		t.Fatalf("Me: %v", err)
	}
	if len(orgs) != 1 || orgs[0].Slug != slug {
		t.Fatalf("provisioned user should belong to %s, got %v", slug, orgs)
	}

	// Idempotent: a second login does not error or duplicate.
	if err := d.ProvisionSSOMember(ctx, org.ID, ssoUser, "newcomer-"+u+"@acme.com", "member"); err != nil {
		t.Fatalf("second ProvisionSSOMember: %v", err)
	}
	_, orgs, _ = d.Me(ctx, ssoUser, "newcomer-"+u+"@acme.com")
	if len(orgs) != 1 {
		t.Fatalf("re-provisioning should not duplicate membership, got %d orgs", len(orgs))
	}

	// The join is audited (visible to the owner).
	events, err := d.ListAuditLog(ctx, owner, slug, 50)
	if err != nil {
		t.Fatalf("ListAuditLog: %v", err)
	}
	var joined int
	for _, e := range events {
		if e.Action == string(audit.ActionMemberAdded) && e.TargetID != nil && *e.TargetID == ssoUser {
			joined++
		}
	}
	if joined != 1 {
		t.Fatalf("expected exactly one member.added audit for the SSO join, got %d", joined)
	}
}
