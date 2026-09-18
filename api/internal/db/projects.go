package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrProjectSlugTaken is returned when a project slug already exists in the org.
var ErrProjectSlugTaken = errors.New("project slug already taken")

// ErrProjectNotFound is returned when a project doesn't exist in the org.
var ErrProjectNotFound = errors.New("project not found")

// Project is a deployable unit inside an organization.
type Project struct {
	ID            string    `json:"id"`
	OrgID         string    `json:"org_id"`
	Name          string    `json:"name"`
	Slug          string    `json:"slug"`
	Description   string    `json:"description"`
	Readme        string    `json:"readme"`
	RepositoryURL string    `json:"repository_url"`
	CreatedBy     string    `json:"created_by"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ProjectInput is the create payload (already trimmed/validated by the caller).
type ProjectInput struct {
	Name          string
	Slug          string
	Description   string
	Readme        string
	RepositoryURL string
}

const projectCols = `id, org_id, name, slug, description, readme, repository_url, created_by, created_at, updated_at`

func scanProject(row pgx.Row) (Project, error) {
	var p Project
	err := row.Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.Description, &p.Readme,
		&p.RepositoryURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// ListProjects returns an org's non-deleted projects, newest first. RLS ensures
// only members can see them; resolveOrg errors (ErrNotMember) otherwise.
func (d *DB) ListProjects(ctx context.Context, actorID, orgSlug string) ([]Project, error) {
	var projects []Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT `+projectCols+` FROM public.projects
			 WHERE org_id = $1 AND deleted_at IS NULL
			 ORDER BY created_at DESC`, orgID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			p, err := scanProject(rows)
			if err != nil {
				return err
			}
			projects = append(projects, p)
		}
		return rows.Err()
	})
	return projects, err
}

// GetProject returns a single project by its slug within the org.
func (d *DB) GetProject(ctx context.Context, actorID, orgSlug, projectSlug string) (Project, error) {
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		row := tx.QueryRow(ctx,
			`SELECT `+projectCols+` FROM public.projects
			 WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`, orgID, projectSlug)
		p, err = scanProject(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		return err
	})
	return p, err
}

// CreateProject creates a project in the org. Member and above (CapWrite);
// viewers are read-only. Returns ErrProjectSlugTaken on a duplicate slug.
func (d *DB) CreateProject(ctx context.Context, actorID, orgSlug string, in ProjectInput) (Project, error) {
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		role, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if !Can(role, CapWrite) {
			return ErrForbidden
		}
		row := tx.QueryRow(ctx,
			`INSERT INTO public.projects (org_id, name, slug, description, readme, repository_url, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7)
			 RETURNING `+projectCols,
			orgID, in.Name, in.Slug, in.Description, in.Readme, in.RepositoryURL, actorID)
		p, err = scanProject(row)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return ErrProjectSlugTaken
		}
		return err
	})
	return p, err
}
