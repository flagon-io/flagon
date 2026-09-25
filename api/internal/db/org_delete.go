package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// DeletedRetention is how long a soft-deleted resource stays restorable. A
// deleted organization is listed and restorable for this long; after it, the org
// is out of reach (the hard purge is a future scheduled job).
const DeletedRetention = 30 * 24 * time.Hour

// DeletedOrg is an organization in the caller's "recently deleted" archive.
type DeletedOrg struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	CreatedAt time.Time `json:"created_at"`
	DeletedAt time.Time `json:"deleted_at"`
	// PurgeAt is when the org stops being restorable (DeletedAt + DeletedRetention).
	PurgeAt time.Time `json:"purge_at"`
}

// DeleteOrg soft-deletes an organization. Owners only. It stamps deleted_at,
// which (migration 0031) hides the org and everything in it from every member at
// once, stops its org access tokens resolving, and frees its slug. Returns the
// org as it was plus the human members to tell about it (the actor included).
func (d *DB) DeleteOrg(ctx context.Context, actorID, slug string) (Org, []string, error) {
	var o Org
	var members []string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		role, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if role != RoleOwner {
			return ErrForbidden
		}
		if err := tx.QueryRow(ctx,
			`SELECT id, name, slug, enforce_two_factor, require_sso, created_at FROM public.orgs WHERE id = $1`, orgID).
			Scan(&o.ID, &o.Name, &o.Slug, &o.EnforceTwoFactor, &o.RequireSSO, &o.CreatedAt); err != nil {
			return err
		}
		o.Role = role

		// Collect the recipients while the org (and its memberships) is still live.
		rows, err := tx.Query(ctx, `SELECT flagon.org_human_member_ids($1, $2)`, actorID, orgID)
		if err != nil {
			return err
		}
		members, err = pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}

		// Audit first: the entry commits atomically with the delete either way.
		if err := recordAudit(ctx, tx, orgID, actorID, audit.ActionOrgDeleted, "organization", orgID,
			"deleted the organization "+o.Name); err != nil {
			return err
		}
		var deletedAt *time.Time
		if err := tx.QueryRow(ctx, `SELECT flagon.delete_org($1, $2)`, actorID, orgID).Scan(&deletedAt); err != nil {
			return err
		}
		if deletedAt == nil {
			return ErrNotMember
		}
		o.DeletedAt = deletedAt
		return nil
	})
	return o, members, err
}

// ListDeletedOrgs returns the orgs the caller owned that were deleted within the
// retention window, newest first.
func (d *DB) ListDeletedOrgs(ctx context.Context, actorID string) ([]DeletedOrg, error) {
	orgs := []DeletedOrg{}
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx,
			`SELECT id, name, slug, created_at, deleted_at FROM flagon.deleted_orgs($1, $2)`,
			actorID, time.Now().Add(-DeletedRetention))
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var o DeletedOrg
			if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.CreatedAt, &o.DeletedAt); err != nil {
				return err
			}
			o.PurgeAt = o.DeletedAt.Add(DeletedRetention)
			orgs = append(orgs, o)
		}
		return rows.Err()
	})
	return orgs, err
}

// RestoreOrg brings back an org the caller owns that was deleted within the
// retention window. newSlug renames it on the way back ("" keeps its slug); if
// the slug is taken by a live org, ErrOrgSlugTaken. Restoring counts toward the
// owned-org plan limit again, so it fails with ErrOrgLimitReached when the caller
// already owns as many live orgs as their plan allows.
func (d *DB) RestoreOrg(ctx context.Context, actorID, orgID, newSlug string) (Org, error) {
	var o Org
	if !uuidPattern.MatchString(orgID) {
		return o, ErrNotMember
	}
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		var owned int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM public.memberships m
			JOIN public.orgs o ON o.id = m.org_id
			WHERE m.user_id = $1 AND m.role = 'owner' AND o.deleted_at IS NULL`,
			actorID).Scan(&owned); err != nil {
			return err
		}
		if owned >= freeOwnedOrgLimit {
			return ErrOrgLimitReached
		}

		err := tx.QueryRow(ctx,
			`SELECT id, name, slug, enforce_two_factor, require_sso, created_at
			 FROM flagon.restore_org($1, $2::uuid, $3, $4)`,
			actorID, orgID, newSlug, time.Now().Add(-DeletedRetention)).
			Scan(&o.ID, &o.Name, &o.Slug, &o.EnforceTwoFactor, &o.RequireSSO, &o.CreatedAt)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation: slug taken
				return ErrOrgSlugTaken
			}
			return mapDefinerErr(err)
		}
		o.Role = RoleOwner
		return recordAudit(ctx, tx, o.ID, actorID, audit.ActionOrgRestored, "organization", o.ID,
			"restored the organization "+o.Name)
	})
	return o, err
}
