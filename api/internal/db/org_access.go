package db

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
)

// OrgAccess is everything the org security-policy check needs about one caller
// and one org, read in a single round trip through flagon.org_access_state.
type OrgAccess struct {
	// Member is false when the caller is not a member of a live org by that
	// slug/id. The policy check then stays out of the way and lets the operation
	// itself answer (a 404 that leaks nothing).
	Member           bool
	OrgID            string
	Role             string
	EnforceTwoFactor bool
	RequireSSO       bool
	// UserTwoFactor is the caller's mirrored 2FA state (see SetUserAuthState).
	UserTwoFactor bool
	// IsService marks an org access token's service principal.
	IsService bool
	// ProviderIDs are the org's live SSO provider ids.
	ProviderIDs []string
	// LinkedSSO is true when the caller has signed in through one of those
	// providers at least once (a mirrored, linked SSO identity).
	LinkedSSO bool
}

// ErrTwoFactorSelf is returned when an actor tries to require 2FA for an org
// without having 2FA on their own account (they would lock themselves out).
var ErrTwoFactorSelf = errors.New("enable two-factor authentication on your own account first")

// ErrSSOSelf is returned when an actor tries to require SSO for an org without
// having signed in through one of its providers (they would lock themselves out).
var ErrSSOSelf = errors.New("sign in through one of the organization's SSO providers first")

// OrgAccessState reads the caller's standing against an org's security policy.
// The org is named by slug, or by id when slug is empty. A non-member (or a
// missing/deleted org) is a zero OrgAccess with Member false, not an error.
func (d *DB) OrgAccessState(ctx context.Context, userID, slug, orgID string) (OrgAccess, error) {
	var a OrgAccess
	var slugArg, idArg *string
	if s := strings.TrimSpace(slug); s != "" {
		slugArg = &s
	} else if id := strings.TrimSpace(orgID); id != "" {
		if !looksLikeUUID(id) {
			return a, nil
		}
		idArg = &id
	} else {
		return a, nil
	}
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		err := tx.QueryRow(ctx,
			`SELECT org_id, role, enforce_two_factor, require_sso, user_two_factor, is_service, provider_ids, linked_sso
			 FROM flagon.org_access_state($1, $2, $3::uuid)`, userID, slugArg, idArg).
			Scan(&a.OrgID, &a.Role, &a.EnforceTwoFactor, &a.RequireSSO, &a.UserTwoFactor,
				&a.IsService, &a.ProviderIDs, &a.LinkedSSO)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		a.Member = true
		return nil
	})
	return a, err
}

// looksLikeUUID is a cheap shape check so a malformed org id reads as "not a
// member" instead of a uuid cast error.
func looksLikeUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, c := range s {
		switch i {
		case 8, 13, 18, 23:
			if c != '-' {
				return false
			}
		default:
			if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
				return false
			}
		}
	}
	return true
}

// SetUserAuthState mirrors the auth layer's security facts about the caller: a
// nil field is left unchanged. twoFactor is whether the account has 2FA enabled;
// ssoProviderIDs, when non-nil, REPLACES the set of SSO providers the user has a
// linked identity with. Only the app (internal token) may call this; it runs in
// the caller's own RLS context, so a user can only ever write their own state.
func (d *DB) SetUserAuthState(ctx context.Context, userID, email string, twoFactor *bool, ssoProviderIDs []string) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := upsertUserExec(ctx, tx, userID, email); err != nil {
			return err
		}
		if twoFactor != nil {
			if _, err := tx.Exec(ctx,
				`UPDATE public.users SET two_factor_enabled = $2, updated_at = now() WHERE id = $1`,
				userID, *twoFactor); err != nil {
				return err
			}
		}
		if ssoProviderIDs != nil {
			ids := cleanProviderIDs(ssoProviderIDs)
			if _, err := tx.Exec(ctx,
				`DELETE FROM public.user_sso_identities WHERE user_id = $1 AND NOT (provider_id = ANY($2::text[]))`,
				userID, ids); err != nil {
				return err
			}
			for _, id := range ids {
				if err := linkSSOIdentity(ctx, tx, userID, id); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// RecordSSOSignIn records that the caller just signed in through an SSO
// provider (a linked identity). Idempotent; refreshes last_seen_at.
func (d *DB) RecordSSOSignIn(ctx context.Context, userID, email, providerID string) error {
	providerID = strings.TrimSpace(providerID)
	if providerID == "" {
		return nil
	}
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := upsertUserExec(ctx, tx, userID, email); err != nil {
			return err
		}
		return linkSSOIdentity(ctx, tx, userID, providerID)
	})
}

func linkSSOIdentity(ctx context.Context, tx pgx.Tx, userID, providerID string) error {
	_, err := tx.Exec(ctx,
		`INSERT INTO public.user_sso_identities (user_id, provider_id) VALUES ($1, $2)
		 ON CONFLICT (user_id, provider_id) DO UPDATE SET last_seen_at = now()`, userID, providerID)
	return err
}

// cleanProviderIDs trims, drops empties, and de-duplicates provider ids.
func cleanProviderIDs(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, id := range in {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// selfLockoutCheck refuses to switch on a requirement the acting user does not
// meet themselves, so enabling a policy can never lock out the person enabling
// it. It runs inside SetOrgSecurity's transaction, as the actor. Service
// principals (org access tokens) are exempt: they have no interactive sign-in to
// lock out, and the policy never applies to them.
func selfLockoutCheck(ctx context.Context, tx pgx.Tx, orgID, actorID string, cur, next OrgSecurity) error {
	turningOn2FA := next.EnforceTwoFactor && !cur.EnforceTwoFactor
	turningOnSSO := next.RequireSSO && !cur.RequireSSO
	if !turningOn2FA && !turningOnSSO {
		return nil
	}
	var twoFactor, isService bool
	err := tx.QueryRow(ctx,
		`SELECT two_factor_enabled, is_service FROM public.users WHERE id = $1`, actorID).
		Scan(&twoFactor, &isService)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	if isService {
		return nil
	}
	if turningOn2FA && !twoFactor {
		return ErrTwoFactorSelf
	}
	if turningOnSSO {
		// The actor is an owner/admin here, so sso_providers is visible to them.
		var linked bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (
			   SELECT 1 FROM public.user_sso_identities i
			   JOIN public.sso_providers s ON s.provider_id = i.provider_id
			   WHERE i.user_id = $1 AND s.org_id = $2 AND s.deleted_at IS NULL)`,
			actorID, orgID).Scan(&linked); err != nil {
			return err
		}
		if !linked {
			return ErrSSOSelf
		}
	}
	return nil
}
