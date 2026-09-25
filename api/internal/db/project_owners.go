package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// Owner principal kinds for project ownership.
const (
	OwnerTypeUser = "user"
	OwnerTypeTeam = "team"
)

// Project ownership errors.
var (
	ErrAlreadyOwner     = errors.New("that principal already owns this project")
	ErrNotOwner         = errors.New("that principal does not own this project")
	ErrInvalidOwnerType = errors.New("owner type must be user or team")
)

// ProjectOwner is one owner of a project - an individual user or a team. OwnerType
// distinguishes them; team rows carry TeamSlug, user rows the profile fields.
type ProjectOwner struct {
	OwnerType   string    `json:"owner_type"`
	PrincipalID string    `json:"principal_id"`
	Name        *string   `json:"name"`
	Email       *string   `json:"email"`
	Username    *string   `json:"username"`
	AvatarURL   *string   `json:"avatar_url"`
	TeamSlug    *string   `json:"team_slug"`
	CreatedAt   time.Time `json:"created_at"`
}

// ListProjectOwners returns a project's owners (users and teams). Anyone who can
// view the project may see them (ProjCapView); otherwise ErrProjectNotFound.
func (d *DB) ListProjectOwners(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]ProjectOwner, string, error) {
	var owners []ProjectOwner
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		if _, _, err := resolveViewableProject(ctx, tx, orgID, projectSlug, actorID); err != nil {
			return err
		}
		cur, err := cursorArg(q, 3)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT owner_type, principal_id, name, email, username, avatar_url, team_slug, created_at, sort_key
			 FROM flagon.project_owners($1, $2, $3, $4, $5, $6)`, actorID, orgSlug, projectSlug, q.Q, q.Clamp()+1, cur)
		if err != nil {
			return err
		}
		defer rows.Close()
		owners = []ProjectOwner{}
		keys := [][]string{}
		for rows.Next() {
			var o ProjectOwner
			var sk []string
			if err := rows.Scan(&o.OwnerType, &o.PrincipalID, &o.Name, &o.Email, &o.Username, &o.AvatarURL, &o.TeamSlug, &o.CreatedAt, &sk); err != nil {
				return err
			}
			owners = append(owners, o)
			keys = append(keys, sk)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		owners, next = paginate.SliceKeyed(owners, keys, q.Clamp())
		return nil
	})
	return owners, next, err
}

// AddProjectOwner makes a user or a team an owner of a project. Owner-tier: the
// actor must already own the project (directly, via a team, or as an org
// owner/admin). For a user owner, login is an email/username of an org member; for
// a team owner, login is the team slug. Returns the added principal's id.
func (d *DB) AddProjectOwner(ctx context.Context, actorID, orgSlug, projectSlug, ownerType, login string) (principalID string, err error) {
	if ownerType != OwnerTypeUser && ownerType != OwnerTypeTeam {
		return "", ErrInvalidOwnerType
	}
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAuthority(ctx, tx, actorID, orgSlug, projectSlug, ProjCapOwn)
		if err != nil {
			return err
		}
		var ct pgconn.CommandTag
		var summary string
		if ownerType == OwnerTypeUser {
			principalID, err = requireOrgMemberByLogin(ctx, tx, orgID, login)
			if err != nil {
				return err
			}
			ct, err = tx.Exec(ctx,
				`INSERT INTO public.project_owners (project_id, owner_user_id, created_by)
				 VALUES ($1, $2, $3) ON CONFLICT (project_id, owner_user_id) WHERE owner_user_id IS NOT NULL DO NOTHING`,
				projectID, principalID, actorID)
			summary = fmt.Sprintf("made %s an owner of %s", login, projectSlug)
		} else {
			principalID, err = resolveTeam(ctx, tx, orgID, login)
			if err != nil {
				return err
			}
			ct, err = tx.Exec(ctx,
				`INSERT INTO public.project_owners (project_id, owner_team_id, created_by)
				 VALUES ($1, $2, $3) ON CONFLICT (project_id, owner_team_id) WHERE owner_team_id IS NOT NULL DO NOTHING`,
				projectID, principalID, actorID)
			summary = fmt.Sprintf("made team %s an owner of %s", login, projectSlug)
		}
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrAlreadyOwner
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectOwnerAdded, "project", projectSlug, summary)
	})
	return principalID, err
}

// RemoveProjectOwner removes a user or team owner from a project. Owner-tier.
// principalID is the user id or team id (from ListProjectOwners).
func (d *DB) RemoveProjectOwner(ctx context.Context, actorID, orgSlug, projectSlug, ownerType, principalID string) error {
	if ownerType != OwnerTypeUser && ownerType != OwnerTypeTeam {
		return ErrInvalidOwnerType
	}
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAuthority(ctx, tx, actorID, orgSlug, projectSlug, ProjCapOwn)
		if err != nil {
			return err
		}
		col := "owner_user_id"
		if ownerType == OwnerTypeTeam {
			col = "owner_team_id"
		}
		ct, err := tx.Exec(ctx,
			`DELETE FROM public.project_owners WHERE project_id = $1 AND `+col+` = $2`,
			projectID, principalID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotOwner
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectOwnerRemove, "project", projectSlug,
			"removed an owner from "+projectSlug)
	})
}
