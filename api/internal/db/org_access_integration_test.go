package db

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5"
)

// Covers the data behind API-side enforcement of the org security policy: the
// mirrored 2FA state and linked SSO identities, the org_access_state window
// (members only, bound to the transaction's user), and the self-lockout guard
// on SetOrgSecurity. Skips unless FLAGON_TEST_DATABASE_URL is set.
func TestOrgAccessEnforcement(t *testing.T) {
	cfg := integrationConfig(t)
	ctx := context.Background()
	if err := Setup(ctx, cfg); err != nil {
		t.Fatalf("Setup: %v", err)
	}
	d := Open(ctx, cfg)
	defer d.Close()

	u := unique(t)
	owner, member, outsider := "acc-owner-"+u, "acc-member-"+u, "acc-out-"+u
	ownerEmail := owner + "@example.com"
	slug := "acc-co-" + u
	org, err := d.CreateOrg(ctx, owner, ownerEmail, "Access Co", slug)
	if err != nil {
		t.Fatalf("CreateOrg: %v", err)
	}
	for _, who := range []string{member, outsider} {
		if _, _, err := d.Me(ctx, who, who+"@example.com"); err != nil {
			t.Fatalf("Me %s: %v", who, err)
		}
	}
	if _, _, err := d.AddMember(ctx, owner, slug, member+"@example.com", RoleMember); err != nil {
		t.Fatalf("AddMember: %v", err)
	}

	// A non-member (and a missing org) reads as "not a member", never an error.
	if st, err := d.OrgAccessState(ctx, outsider, slug, ""); err != nil || st.Member {
		t.Fatalf("outsider OrgAccessState = %+v, %v; want non-member", st, err)
	}
	if st, err := d.OrgAccessState(ctx, member, "no-such-org-"+u, ""); err != nil || st.Member {
		t.Fatalf("missing org OrgAccessState = %+v, %v", st, err)
	}
	if st, err := d.OrgAccessState(ctx, member, "", "not-a-uuid"); err != nil || st.Member {
		t.Fatalf("malformed id OrgAccessState = %+v, %v", st, err)
	}

	st, err := d.OrgAccessState(ctx, member, slug, "")
	if err != nil || !st.Member || st.Role != RoleMember || st.OrgID != org.ID {
		t.Fatalf("member OrgAccessState = %+v, %v", st, err)
	}
	if st.EnforceTwoFactor || st.RequireSSO || st.UserTwoFactor || st.LinkedSSO || len(st.ProviderIDs) != 0 {
		t.Fatalf("fresh org/user should have no policy and no auth state: %+v", st)
	}
	if byID, err := d.OrgAccessState(ctx, member, "", org.ID); err != nil || !byID.Member {
		t.Fatalf("OrgAccessState by id = %+v, %v", byID, err)
	}

	// Self-lockout: the owner can't require 2FA before enabling it themselves.
	err = d.SetOrgSecurity(ctx, owner, slug, OrgSecurity{EnforceTwoFactor: true, BasePermission: "read"})
	if !errors.Is(err, ErrTwoFactorSelf) {
		t.Fatalf("enable 2FA requirement without own 2FA: err = %v, want ErrTwoFactorSelf", err)
	}
	on := true
	if err := d.SetUserAuthState(ctx, owner, ownerEmail, &on, nil); err != nil {
		t.Fatalf("SetUserAuthState owner: %v", err)
	}
	if err := d.SetOrgSecurity(ctx, owner, slug, OrgSecurity{EnforceTwoFactor: true, BasePermission: "read"}); err != nil {
		t.Fatalf("enable 2FA requirement with own 2FA: %v", err)
	}
	st, _ = d.OrgAccessState(ctx, member, slug, "")
	if !st.EnforceTwoFactor || st.UserTwoFactor {
		t.Fatalf("member state after 2FA requirement = %+v", st)
	}
	if err := d.SetUserAuthState(ctx, member, member+"@example.com", &on, nil); err != nil {
		t.Fatalf("SetUserAuthState member: %v", err)
	}
	if st, _ = d.OrgAccessState(ctx, member, slug, ""); !st.UserTwoFactor {
		t.Fatalf("member 2FA not mirrored: %+v", st)
	}

	// SSO: the org's live provider ids are visible to the policy check (members
	// can't read sso_providers directly), and a linked identity is tracked.
	providerID := "acc-okta-" + u
	if _, err := d.CreateSSOProvider(ctx, owner, slug, SSOProviderInput{
		ProviderID: providerID, Type: SSOTypeOIDC, Issuer: "https://idp.example.com",
		OIDC: &SSOOIDCConfig{ClientID: "c"}, Secrets: SSOSecrets{ClientSecret: "s"},
	}); err != nil {
		t.Fatalf("CreateSSOProvider: %v", err)
	}
	err = d.SetOrgSecurity(ctx, owner, slug, OrgSecurity{EnforceTwoFactor: true, RequireSSO: true, BasePermission: "read"})
	if !errors.Is(err, ErrSSOSelf) {
		t.Fatalf("require SSO without own SSO sign-in: err = %v, want ErrSSOSelf", err)
	}
	if err := d.RecordSSOSignIn(ctx, owner, ownerEmail, providerID); err != nil {
		t.Fatalf("RecordSSOSignIn owner: %v", err)
	}
	if err := d.SetOrgSecurity(ctx, owner, slug, OrgSecurity{EnforceTwoFactor: true, RequireSSO: true, BasePermission: "read"}); err != nil {
		t.Fatalf("require SSO after own SSO sign-in: %v", err)
	}

	st, _ = d.OrgAccessState(ctx, member, slug, "")
	if !st.RequireSSO || !slices.Contains(st.ProviderIDs, providerID) || st.LinkedSSO {
		t.Fatalf("member SSO state = %+v", st)
	}
	// A link to some other provider doesn't count; the org's own does.
	if err := d.SetUserAuthState(ctx, member, member+"@example.com", nil, []string{"someone-elses-idp"}); err != nil {
		t.Fatalf("SetUserAuthState links: %v", err)
	}
	if st, _ = d.OrgAccessState(ctx, member, slug, ""); st.LinkedSSO {
		t.Fatal("a foreign provider link must not satisfy the org's SSO requirement")
	}
	if err := d.SetUserAuthState(ctx, member, member+"@example.com", nil, []string{providerID, " ", providerID}); err != nil {
		t.Fatalf("SetUserAuthState links: %v", err)
	}
	if st, _ = d.OrgAccessState(ctx, member, slug, ""); !st.LinkedSSO || !st.UserTwoFactor {
		t.Fatalf("linked SSO (and untouched 2FA) not reflected: %+v", st)
	}
	// Replacing the set with nothing unlinks.
	if err := d.SetUserAuthState(ctx, member, member+"@example.com", nil, []string{}); err != nil {
		t.Fatalf("SetUserAuthState unlink: %v", err)
	}
	if st, _ = d.OrgAccessState(ctx, member, slug, ""); st.LinkedSSO {
		t.Fatal("an emptied link set must unlink")
	}

	// The window is bound to the transaction's user: asking about someone else
	// through a direct call returns nothing (RLS + definer binding).
	var n int
	if err := d.inUserTx(ctx, outsider, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT count(*) FROM flagon.org_access_state($1, $2, NULL)`, member, slug).Scan(&n)
	}); err != nil || n != 0 {
		t.Fatalf("org_access_state for another user: n=%d err=%v, want 0 rows", n, err)
	}
}
