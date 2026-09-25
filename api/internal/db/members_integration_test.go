package db

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/paginate"
)

// TestListMembersExcludesTokenServiceAccounts guards the People list against an
// org access token's service principal: minting an OAT adds a membership for a
// service user, which must never be listed as a member. Skips unless
// FLAGON_TEST_DATABASE_URL is set.
func TestListMembersExcludesTokenServiceAccounts(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	owner := "user-members-owner-" + unique(t)
	slug := "members-co-" + unique(t)
	if _, err := d.CreateOrg(ctx, owner, "members-owner@example.com", "Members Co", slug); err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	if _, _, err := d.CreateOAT(ctx, owner, slug, "ci", "member", []string{"read:org"}, nil); err != nil {
		t.Fatalf("CreateOAT: %v", err)
	}

	members, _, err := d.ListMembers(ctx, owner, slug, paginate.Query{})
	if err != nil {
		t.Fatalf("ListMembers: %v", err)
	}
	if len(members) != 1 || members[0].UserID != owner {
		ids := make([]string, len(members))
		for i, m := range members {
			ids[i] = m.UserID
		}
		t.Fatalf("members = %v, want only the owner %q (token service accounts must be hidden)", ids, owner)
	}
}
