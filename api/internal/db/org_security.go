package db

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// OrgSecurity is an organization's security + member-access policy. The app's auth
// layer owns the mechanisms (2FA, SSO); these are the org-level REQUIREMENTS. The
// API enforces them on every org-scoped operation (service.CheckOrgAccess); the
// app's page gate reads them too, for the redirect UX.
type OrgSecurity struct {
	// EnforceTwoFactor requires every member to have 2FA enabled to access the org.
	EnforceTwoFactor bool `json:"enforce_two_factor"`
	// RequireSSO requires members to sign in through the org's SSO provider.
	RequireSSO bool `json:"require_sso"`
	// BasePermission is the default project (repo) access every member gets, raised
	// by any explicit per-project grant (GitHub's base-permission model). One of
	// none|read|triage|write|maintain|admin.
	BasePermission string `json:"base_permission"`
}

// ErrInvalidBasePermission is returned when setting a base permission that isn't
// one of the allowed values.
var ErrInvalidBasePermission = errors.New("invalid base permission")

// validBasePermission reports whether s is an allowed org base permission.
func validBasePermission(s string) bool {
	return s == BasePermissionNone || validProjectRole(s)
}

// GetOrgSecurity returns an org's security policy. Owners/admins only (it's a
// settings read; members learn the policy indirectly via the org object + the
// app gate). Mirrors GetAuditConfig.
func (d *DB) GetOrgSecurity(ctx context.Context, actorID, slug string) (OrgSecurity, error) {
	var s OrgSecurity
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		role, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if role != RoleOwner && role != RoleAdmin {
			return ErrForbidden
		}
		return tx.QueryRow(ctx,
			`SELECT enforce_two_factor, require_sso, base_permission FROM public.orgs WHERE id = $1`, orgID).
			Scan(&s.EnforceTwoFactor, &s.RequireSSO, &s.BasePermission)
	})
	return s, err
}

// SetOrgSecurity updates an org's security policy. Owners/admins only, and the
// change is itself audited (a security-policy change is exactly what you audit).
func (d *DB) SetOrgSecurity(ctx context.Context, actorID, slug string, s OrgSecurity) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		role, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if role != RoleOwner && role != RoleAdmin {
			return ErrForbidden
		}
		if !validBasePermission(s.BasePermission) {
			return ErrInvalidBasePermission
		}
		// Read the current policy so we can audit precisely what changed.
		var cur OrgSecurity
		if err := tx.QueryRow(ctx,
			`SELECT enforce_two_factor, require_sso, base_permission FROM public.orgs WHERE id = $1`, orgID).
			Scan(&cur.EnforceTwoFactor, &cur.RequireSSO, &cur.BasePermission); err != nil {
			return err
		}
		// Self-lockout guard: never switch on a requirement the actor doesn't meet.
		if err := selfLockoutCheck(ctx, tx, orgID, actorID, cur, s); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`UPDATE public.orgs SET enforce_two_factor = $1, require_sso = $2, base_permission = $3, updated_at = now() WHERE id = $4`,
			s.EnforceTwoFactor, s.RequireSSO, s.BasePermission, orgID); err != nil {
			return err
		}
		if cur.EnforceTwoFactor != s.EnforceTwoFactor {
			verb := "disabled"
			if s.EnforceTwoFactor {
				verb = "enabled"
			}
			if err := recordAudit(ctx, tx, orgID, actorID, audit.ActionOrgSecurity, "organization", orgID,
				verb+" the two-factor authentication requirement"); err != nil {
				return err
			}
		}
		if cur.RequireSSO != s.RequireSSO {
			verb := "disabled"
			if s.RequireSSO {
				verb = "enabled"
			}
			if err := recordAudit(ctx, tx, orgID, actorID, audit.ActionOrgSecurity, "organization", orgID,
				verb+" the single sign-on requirement"); err != nil {
				return err
			}
		}
		if cur.BasePermission != s.BasePermission {
			if err := recordAudit(ctx, tx, orgID, actorID, audit.ActionOrgSecurity, "organization", orgID,
				"set the base member permission to "+s.BasePermission); err != nil {
				return err
			}
		}
		return nil
	})
}
