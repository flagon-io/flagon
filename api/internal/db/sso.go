package db

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// ProvisionSSOMember ensures a user who authenticated through an org's SSO provider
// is a member of that org. Idempotent, and called across the internal-token boundary
// only after the app's auth layer has verified the SSO login for that provider (so
// the org->IdP binding is what authorizes the membership). It upserts the user (so a
// brand-new SSO user has a domain row for the FK) then provisions the membership via
// the SECURITY DEFINER helper, auditing a first-time join.
func (d *DB) ProvisionSSOMember(ctx context.Context, orgID, userID, email, role string) error {
	if role == "" {
		role = RoleMember
	}
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := upsertUserExec(ctx, tx, userID, email); err != nil {
			return err
		}
		var created bool
		if err := tx.QueryRow(ctx,
			`SELECT flagon.provision_sso_member($1, $2, $3)`, orgID, userID, role).Scan(&created); err != nil {
			return err
		}
		if created {
			return recordAudit(ctx, tx, orgID, userID, audit.ActionMemberAdded, "member", userID,
				"joined via single sign-on")
		}
		return nil
	})
}
