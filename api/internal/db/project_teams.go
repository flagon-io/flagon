package db

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// Project team-grant errors.
var (
	ErrAlreadyTeamGrant = errors.New("that team already has a role on this project")
	ErrNotTeamGrant     = errors.New("that team has no role on this project")
)

// ProjectTeam is a team's role grant on a project, with the team's details.
type ProjectTeam struct {
	TeamID    string    `json:"team_id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ListProjectTeams returns the teams granted a role on a project. Anyone who can
// view the project may see them (ProjCapView); otherwise ErrProjectNotFound.
func (d *DB) ListProjectTeams(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]ProjectTeam, string, error) {
	var teams []ProjectTeam
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		if _, _, err := resolveViewableProject(ctx, tx, orgID, projectSlug, actorID); err != nil {
			return err
		}
		cur, err := cursorArg(q, 2)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT team_id, name, slug, role, created_at, sort_key
			 FROM flagon.project_teams($1, $2, $3, $4, $5, $6)`, actorID, orgSlug, projectSlug, q.Q, q.Clamp()+1, cur)
		if err != nil {
			return err
		}
		defer rows.Close()
		teams = []ProjectTeam{}
		keys := [][]string{}
		for rows.Next() {
			var t ProjectTeam
			var sk []string
			if err := rows.Scan(&t.TeamID, &t.Name, &t.Slug, &t.Role, &t.CreatedAt, &sk); err != nil {
				return err
			}
			teams = append(teams, t)
			keys = append(keys, sk)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		teams, next = paginate.SliceKeyed(teams, keys, q.Clamp())
		return nil
	})
	return teams, next, err
}

// AddProjectTeam grants a team a repository-style role on a project. The actor
// must be able to administer the project's access (effective admin or owner).
func (d *DB) AddProjectTeam(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug, role string) error {
	if !validProjectRole(role) {
		return ErrInvalidRole
	}
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAsAdmin(ctx, tx, actorID, orgSlug, projectSlug)
		if err != nil {
			return err
		}
		teamID, err := resolveTeam(ctx, tx, orgID, teamSlug)
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx,
			`INSERT INTO public.project_team_members (project_id, team_id, role, created_by)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (project_id, team_id) DO NOTHING`, projectID, teamID, role, actorID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrAlreadyTeamGrant
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectTeamGranted, "project", projectSlug,
			fmt.Sprintf("granted team %s %s on %s", teamSlug, role, projectSlug))
	})
}

// SetProjectTeamRole changes a team's role on a project.
func (d *DB) SetProjectTeamRole(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug, role string) error {
	if !validProjectRole(role) {
		return ErrInvalidRole
	}
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAsAdmin(ctx, tx, actorID, orgSlug, projectSlug)
		if err != nil {
			return err
		}
		teamID, err := resolveTeam(ctx, tx, orgID, teamSlug)
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx,
			`UPDATE public.project_team_members SET role = $3, updated_at = now()
			 WHERE project_id = $1 AND team_id = $2`, projectID, teamID, role)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotTeamGrant
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectTeamChanged, "project", projectSlug,
			fmt.Sprintf("changed team %s's role to %s on %s", teamSlug, role, projectSlug))
	})
}

// RemoveProjectTeam revokes a team's role on a project.
func (d *DB) RemoveProjectTeam(ctx context.Context, actorID, orgSlug, projectSlug, teamSlug string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAsAdmin(ctx, tx, actorID, orgSlug, projectSlug)
		if err != nil {
			return err
		}
		teamID, err := resolveTeam(ctx, tx, orgID, teamSlug)
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx,
			`DELETE FROM public.project_team_members WHERE project_id = $1 AND team_id = $2`, projectID, teamID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotTeamGrant
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectTeamRevoked, "project", projectSlug,
			fmt.Sprintf("revoked team %s's access to %s", teamSlug, projectSlug))
	})
}
