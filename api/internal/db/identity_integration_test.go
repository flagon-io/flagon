package db

import (
	"context"
	"strconv"
	"testing"
	"time"
)

func TestIdentityOrgsAreTenantIsolated(t *testing.T) {
	cfg := integrationConfig(t) // skips unless FLAGON_TEST_DATABASE_URL is set
	ctx := context.Background()

	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	const alice, bob = "user-alice", "user-bob"

	// Alice creates an org and is its owner.
	org, err := d.CreateOrg(ctx, alice, "alice@example.com", "Alice Co", "alice-co-"+unique(t))
	if err != nil {
		t.Fatalf("alice CreateOrg: %v", err)
	}
	if org.Role != "owner" {
		t.Errorf("creator role = %q, want owner", org.Role)
	}

	// Alice's /me shows the org.
	aliceUser, aliceOrgs, err := d.Me(ctx, alice, "alice@example.com")
	if err != nil {
		t.Fatalf("alice Me: %v", err)
	}
	if aliceUser.ID != alice {
		t.Errorf("me user id = %q, want %q", aliceUser.ID, alice)
	}
	if !containsOrg(aliceOrgs, org.ID) {
		t.Errorf("alice does not see her own org %s", org.ID)
	}

	// Bob must NOT see Alice's org - RLS isolation.
	_, bobOrgs, err := d.Me(ctx, bob, "bob@example.com")
	if err != nil {
		t.Fatalf("bob Me: %v", err)
	}
	if containsOrg(bobOrgs, org.ID) {
		t.Fatalf("RLS LEAK: bob can see alice's org %s", org.ID)
	}
	if len(bobOrgs) != 0 {
		t.Errorf("bob should have no orgs, has %d", len(bobOrgs))
	}

	// Duplicate slug is rejected.
	slug := "dupe-" + unique(t)
	if _, err := d.CreateOrg(ctx, alice, "alice@example.com", "Dupe", slug); err != nil {
		t.Fatalf("first create: %v", err)
	}
	if _, err := d.CreateOrg(ctx, bob, "bob@example.com", "Dupe", slug); err != ErrOrgSlugTaken {
		t.Errorf("duplicate slug error = %v, want ErrOrgSlugTaken", err)
	}
}

func containsOrg(orgs []Org, id string) bool {
	for _, o := range orgs {
		if o.ID == id {
			return true
		}
	}
	return false
}

// unique returns a suffix that differs across runs so reruns against a
// persistent test DB don't collide on the globally-unique org slug.
func unique(t *testing.T) string {
	t.Helper()
	return strconv.FormatInt(time.Now().UnixNano(), 36)
}
