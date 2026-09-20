package db

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/paginate"
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
	// DeletedAt is set only on rows read from the deleted-projects archive; it is
	// nil (omitted) for the normal live-project reads.
	DeletedAt *time.Time `json:"deleted_at,omitempty"`
}

// ProjectInput is the create payload (already trimmed/validated by the caller).
type ProjectInput struct {
	Name          string
	Slug          string
	Description   string
	Readme        string
	RepositoryURL string
}

// ProjectUpdate is a partial edit: a nil field is left unchanged, so callers
// (the edit form or the AI tool) can change only what they mean to. Slug is
// treated as a rename when non-nil.
type ProjectUpdate struct {
	Name          *string
	Slug          *string
	Description   *string
	Readme        *string
	RepositoryURL *string
}

const projectCols = `id, org_id, name, slug, description, readme, repository_url, created_by, created_at, updated_at`

func scanProject(row pgx.Row) (Project, error) {
	var p Project
	err := row.Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.Description, &p.Readme,
		&p.RepositoryURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	return p, err
}

// ListProjects returns a page of an org's non-deleted projects, searched by name
// and slug and ordered by name (a stable keyset over lower(name), id). RLS ensures
// only members can see them; resolveOrg errors (ErrNotMember) otherwise. Returns
// the items plus the opaque next cursor ("" when this is the last page).
func (d *DB) ListProjects(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]Project, string, error) {
	var projects []Project
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		keys, err := q.Keys()
		if err != nil {
			return err
		}
		limit := q.Clamp()

		// name + slug substring search; keyset over (lower(name), id) for a stable
		// order that a trigram index (migration 0027) can accelerate.
		args := []any{orgID, q.Q}
		where := `org_id = $1 AND deleted_at IS NULL
			AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR slug ILIKE '%' || $2 || '%')`
		if len(keys) == 2 {
			args = append(args, keys[0], keys[1])
			where += ` AND (lower(name) > $3 OR (lower(name) = $3 AND id > $4))`
		} else if len(keys) != 0 {
			return paginate.ErrBadCursor
		}
		args = append(args, limit+1)
		// ARRAY[lower(name), id] is the keyset sort key the DB itself computes (same
		// as the ORDER BY), returned so the cursor is never re-derived in Go.
		sql := `SELECT ` + projectCols + `, ARRAY[lower(name), id] AS sort_key FROM public.projects
			WHERE ` + where + `
			ORDER BY lower(name), id
			LIMIT $` + strconv.Itoa(len(args))

		rows, err := tx.Query(ctx, sql, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		projects = []Project{}
		sortKeys := [][]string{}
		for rows.Next() {
			var p Project
			var sk []string
			if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.Description, &p.Readme,
				&p.RepositoryURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt, &sk); err != nil {
				return err
			}
			projects = append(projects, p)
			sortKeys = append(sortKeys, sk)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		projects, next = paginate.SliceKeyed(projects, sortKeys, limit)
		return nil
	})
	return projects, next, err
}

// ListDeletedProjects returns an org's soft-deleted projects (the restore
// archive), newest-deleted first. Owner/admin only - the archive is an
// administrative view, like the audit log. RLS lets members read soft-deleted
// rows (a relaxed select), so the role check is enforced here in the Go layer.
func (d *DB) ListDeletedProjects(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]Project, string, error) {
	var projects []Project
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
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
		keys, err := q.Keys()
		if err != nil {
			return err
		}
		limit := q.Clamp()
		args := []any{orgID, q.Q}
		where := `org_id = $1 AND deleted_at IS NOT NULL
			AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR slug ILIKE '%' || $2 || '%')`
		if len(keys) == 2 {
			args = append(args, keys[0], keys[1])
			where += ` AND (lower(name) > $3 OR (lower(name) = $3 AND id > $4))`
		} else if len(keys) != 0 {
			return paginate.ErrBadCursor
		}
		args = append(args, limit+1)
		sql := `SELECT ` + projectCols + `, deleted_at, ARRAY[lower(name), id] AS sort_key FROM public.projects
			WHERE ` + where + `
			ORDER BY lower(name), id
			LIMIT $` + strconv.Itoa(len(args))
		rows, err := tx.Query(ctx, sql, args...)
		if err != nil {
			return err
		}
		defer rows.Close()
		projects = []Project{}
		sortKeys := [][]string{}
		for rows.Next() {
			var p Project
			var sk []string
			if err := rows.Scan(&p.ID, &p.OrgID, &p.Name, &p.Slug, &p.Description, &p.Readme,
				&p.RepositoryURL, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt, &p.DeletedAt, &sk); err != nil {
				return err
			}
			projects = append(projects, p)
			sortKeys = append(sortKeys, sk)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		projects, next = paginate.SliceKeyed(projects, sortKeys, limit)
		return nil
	})
	return projects, next, err
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
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectCreated, "project", p.Slug, "created project "+p.Name)
	})
	return p, err
}

// UpdateProject applies a partial edit to a live project, identified by its
// current slug. Member and above (CapWrite). Returns ErrProjectNotFound if no
// live project matches, or ErrProjectSlugTaken if a rename collides.
func (d *DB) UpdateProject(ctx context.Context, actorID, orgSlug, projectSlug string, in ProjectUpdate) (Project, error) {
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
		// COALESCE keeps each column unless the caller passed a new value, so a
		// partial update never wipes fields it did not mention.
		row := tx.QueryRow(ctx,
			`UPDATE public.projects SET
				name = COALESCE($1, name),
				slug = COALESCE($2, slug),
				description = COALESCE($3, description),
				readme = COALESCE($4, readme),
				repository_url = COALESCE($5, repository_url),
				updated_at = now()
			 WHERE org_id = $6 AND slug = $7 AND deleted_at IS NULL
			 RETURNING `+projectCols,
			in.Name, in.Slug, in.Description, in.Readme, in.RepositoryURL, orgID, projectSlug)
		p, err = scanProject(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return ErrProjectSlugTaken
		}
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectUpdated, "project", p.Slug, "updated project "+p.Name)
	})
	return p, err
}

// SetProjectDeleted soft-deletes (deleted=true) or restores (deleted=false) a
// project by slug. Destructive, so it requires effective project admin (org
// owner/admin, or an explicit admin grant) - not merely write. Soft delete frees
// the slug at once (a live-rows-only unique index), so a new project may reuse
// the name. Restore brings back the most recently deleted project with that slug,
// and only when the slug is still free among live projects - otherwise
// ErrProjectSlugTaken. Returns ErrProjectNotFound when nothing matches in the
// opposite state.
func (d *DB) SetProjectDeleted(ctx context.Context, actorID, orgSlug, projectSlug string, deleted bool) (Project, error) {
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		// Resolve the target row so we can check the caller's effective role on it.
		// Delete acts on the live row; restore on the newest soft-deleted one.
		var projectID string
		idQuery := `SELECT id FROM public.projects WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`
		if !deleted {
			idQuery = `SELECT id FROM public.projects WHERE org_id = $1 AND slug = $2 AND deleted_at IS NOT NULL
				ORDER BY deleted_at DESC LIMIT 1`
		}
		if err := tx.QueryRow(ctx, idQuery, orgID, projectSlug).Scan(&projectID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrProjectNotFound
			}
			return err
		}
		// Delete/restore is an owner-tier power (a step above admin): only a project
		// owner (direct or via a team) or an org owner/admin may do it.
		auth, err := resolveProjectAuthority(ctx, tx, orgID, projectID, actorID)
		if err != nil {
			return err
		}
		if !auth.can(ProjCapOwn) {
			return ErrForbidden
		}
		// Delete matches the single live row and stamps deleted_at. Restore targets
		// the newest soft-deleted row with that slug (several may exist once a slug
		// has been reused and re-deleted); the live-rows-only unique index rejects
		// the restore if the slug is currently taken. The membership-only UPDATE
		// policy lets us touch a soft-deleted row even though SELECT hides it.
		var row pgx.Row
		if deleted {
			row = tx.QueryRow(ctx,
				`UPDATE public.projects SET deleted_at = now(), updated_at = now()
				 WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL
				 RETURNING `+projectCols, orgID, projectSlug)
		} else {
			row = tx.QueryRow(ctx,
				`UPDATE public.projects SET deleted_at = NULL, updated_at = now()
				 WHERE id = (
					SELECT id FROM public.projects
					WHERE org_id = $1 AND slug = $2 AND deleted_at IS NOT NULL
					ORDER BY deleted_at DESC
					LIMIT 1
				 )
				 RETURNING `+projectCols, orgID, projectSlug)
		}
		p, err = scanProject(row)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation on restore
			return ErrProjectSlugTaken
		}
		if err != nil {
			return err
		}
		action, verb := audit.ActionProjectRestored, "restored project "
		if deleted {
			action, verb = audit.ActionProjectDeleted, "deleted project "
		}
		return recordAudit(ctx, tx, orgID, actorID, action, "project", p.Slug, verb+p.Name)
	})
	return p, err
}
