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
	// PurgeAt is when a deleted project stops being restorable (DeletedAt +
	// DeletedRetention). Like DeletedAt, it is set only on archive rows.
	PurgeAt *time.Time `json:"purge_at,omitempty"`
	// Viewer is the CALLER's own access to this project, so a client can show or
	// hide controls (edit, settings, access, delete) without re-deriving the RBAC
	// rules. Set on single-project reads (GetProject); omitted on list rows.
	Viewer *ProjectViewer `json:"viewer,omitempty"`
}

// ProjectViewer is the caller's resolved access to a project: their effective
// role on the read..admin ladder, whether they are an owner (the tier above
// admin), and the capabilities that grants. Informational only - every
// operation re-checks on the server.
type ProjectViewer struct {
	Role        string   `json:"role" doc:"The caller's effective project role (read, triage, write, maintain, admin); empty when access comes only from ownership"`
	Owner       bool     `json:"owner" doc:"Whether the caller is a project owner (org owners and admins always are)"`
	Permissions []string `json:"permissions" doc:"Capabilities the caller holds: project:view, project:write (edit metadata), project:manage (settings and rename), project:admin (manage access), project:own (delete, restore, manage owners)"`
}

// viewerFor renders an authority as the client-facing ProjectViewer.
func viewerFor(a projectAuthority) *ProjectViewer {
	v := &ProjectViewer{Role: a.Role, Owner: a.Owner, Permissions: []string{}}
	for _, c := range []ProjectCapability{ProjCapView, ProjCapWrite, ProjCapManage, ProjCapAdmin, ProjCapOwn} {
		if a.can(c) {
			v.Permissions = append(v.Permissions, string(c))
		}
	}
	return v
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

// ListProjects returns a page of the org's non-deleted projects the actor can
// VIEW (effective project role read+ or ownership; flagon.project_permits,
// migration 0034), searched by name and slug and ordered by name (a stable keyset
// over lower(name), id). The view filter runs inside the one list query (no
// per-row round trips) and RLS applies the same rule again underneath.
// resolveOrg errors (ErrNotMember) for a non-member. Returns the items plus the
// opaque next cursor ("" when this is the last page).
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
		args := []any{orgID, q.Q, actorID}
		where := `org_id = $1 AND deleted_at IS NULL
			AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR slug ILIKE '%' || $2 || '%')
			AND flagon.project_permits(org_id, id, $3, 'read')`
		if len(keys) == 2 {
			args = append(args, keys[0], keys[1])
			where += ` AND (lower(name) > $4 OR (lower(name) = $4 AND id > $5))`
		} else if len(keys) != 0 {
			return paginate.ErrBadCursor
		}
		args = append(args, limit+1)
		// ARRAY[lower(name), id::text] is the keyset sort key the DB itself computes (same
		// as the ORDER BY), returned so the cursor is never re-derived in Go.
		sql := `SELECT ` + projectCols + `, ARRAY[lower(name), id::text] AS sort_key FROM public.projects
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

// ListDeletedProjects returns an org's soft-deleted projects that are still
// restorable (deleted within DeletedRetention; the restore archive), each with
// its purge_at. Owner/admin only - the archive is an administrative view, like
// the audit log. RLS (since 0034) returns only the soft-deleted rows the caller
// can view (project read access, which org admins/owners always have), but it
// does not narrow the archive to admins, so the org-role check is enforced here
// in the Go layer.
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
		args := []any{orgID, q.Q, time.Now().Add(-DeletedRetention)}
		where := `org_id = $1 AND deleted_at IS NOT NULL AND deleted_at > $3
			AND ($2 = '' OR name ILIKE '%' || $2 || '%' OR slug ILIKE '%' || $2 || '%')`
		if len(keys) == 2 {
			args = append(args, keys[0], keys[1])
			where += ` AND (lower(name) > $4 OR (lower(name) = $4 AND id > $5))`
		} else if len(keys) != 0 {
			return paginate.ErrBadCursor
		}
		args = append(args, limit+1)
		sql := `SELECT ` + projectCols + `, deleted_at, ARRAY[lower(name), id::text] AS sort_key FROM public.projects
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
			if p.DeletedAt != nil {
				purge := p.DeletedAt.Add(DeletedRetention)
				p.PurgeAt = &purge
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

// GetProject returns a single project by its slug within the org, with the
// caller's own access on it (Viewer). Requires ProjCapView: a project the caller
// cannot view is ErrProjectNotFound (not ErrForbidden), so its existence is not
// disclosed.
func (d *DB) GetProject(ctx context.Context, actorID, orgSlug, projectSlug string) (Project, error) {
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		projectID, auth, err := resolveViewableProject(ctx, tx, orgID, projectSlug, actorID)
		if err != nil {
			return err
		}
		p, err = scanProject(tx.QueryRow(ctx,
			`SELECT `+projectCols+` FROM public.projects WHERE id = $1`, projectID))
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		if err != nil {
			return err
		}
		p.Viewer = viewerFor(auth)
		return nil
	})
	return p, err
}

// CreateProject creates a project in the org. Member and above (CapWrite);
// viewers are read-only. A creator who is not an org owner/admin is granted admin
// on the new project (you administer what you create), so they can manage it even
// when the org's base permission is read or none. Returns ErrProjectSlugTaken on a
// duplicate slug.
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
		// Insert WITHOUT RETURNING: under a base permission of none the creator
		// cannot SELECT the row until their creator grant exists, and RETURNING is
		// checked against the SELECT policy. The id is minted up front instead.
		var id string
		if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&id); err != nil {
			return err
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO public.projects (id, org_id, name, slug, description, readme, repository_url, created_by)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			id, orgID, in.Name, in.Slug, in.Description, in.Readme, in.RepositoryURL, actorID)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return ErrProjectSlugTaken
		}
		if err != nil {
			return err
		}
		granted := false
		if role != RoleOwner && role != RoleAdmin {
			if err := tx.QueryRow(ctx, `SELECT flagon.grant_project_creator($1)`, id).Scan(&granted); err != nil {
				return err
			}
		}
		p, err = scanProject(tx.QueryRow(ctx, `SELECT `+projectCols+` FROM public.projects WHERE id = $1`, id))
		if err != nil {
			return err
		}
		if err := recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectCreated, "project", p.Slug, "created project "+p.Name); err != nil {
			return err
		}
		if granted {
			return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectAccessGranted, "project", p.Slug,
				"granted the creator admin on "+p.Slug)
		}
		return nil
	})
	return p, err
}

// UpdateProject applies a partial edit to a live project, identified by its
// current slug. Editing metadata (name, description, readme, repository URL)
// needs the effective project role write+ (ProjCapWrite). Renaming the slug needs
// maintain+ (ProjCapManage): it changes the project's URL and breaks every
// external reference to it (links, bookmarks, API/CLI calls, integrations), a
// settings-level change rather than a content edit. Returns ErrProjectNotFound if
// no live project matches or the caller cannot view it, ErrForbidden if they can
// view it but lack the capability, or ErrProjectSlugTaken if a rename collides.
func (d *DB) UpdateProject(ctx context.Context, actorID, orgSlug, projectSlug string, in ProjectUpdate) (Project, error) {
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		_, auth, err := resolveViewableProject(ctx, tx, orgID, projectSlug, actorID)
		if err != nil {
			return err
		}
		if !auth.can(ProjCapWrite) {
			return ErrForbidden
		}
		if in.Slug != nil && *in.Slug != projectSlug && !auth.can(ProjCapManage) {
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

// SetProjectDeleted soft-deletes (deleted=true) or restores (deleted=false,
// under the project's old slug; see RestoreProject) a project by slug.
// Destructive, so it requires the project owner tier (a project owner, or an
// org owner/admin), not merely write. Soft delete frees the slug at once (a
// live-rows-only unique index), so a new project may reuse the name. Returns
// ErrProjectNotFound when no live project matches.
func (d *DB) SetProjectDeleted(ctx context.Context, actorID, orgSlug, projectSlug string, deleted bool) (Project, error) {
	if !deleted {
		return d.RestoreProject(ctx, actorID, orgSlug, projectSlug, "")
	}
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		var projectID string
		if err := tx.QueryRow(ctx,
			`SELECT id FROM public.projects WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`,
			orgID, projectSlug).Scan(&projectID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrProjectNotFound
			}
			return err
		}
		// Delete is an owner-tier power (a step above admin): only a project owner
		// (direct or via a team) or an org owner/admin may do it.
		auth, err := resolveProjectAuthority(ctx, tx, orgID, projectID, actorID)
		if err != nil {
			return err
		}
		if !auth.can(ProjCapOwn) {
			return ErrForbidden
		}
		p, err = scanProject(tx.QueryRow(ctx,
			`UPDATE public.projects SET deleted_at = now(), updated_at = now()
			 WHERE id = $1 AND deleted_at IS NULL
			 RETURNING `+projectCols, projectID))
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectDeleted, "project", p.Slug, "deleted project "+p.Name)
	})
	return p, err
}

// RestoreProject brings back the most recently deleted project with the given
// slug, provided it was deleted within DeletedRetention (the same window orgs
// have); outside it the project is ErrProjectNotFound. newSlug renames it on the
// way back ("" keeps its slug); a slug already used by a live project is
// ErrProjectSlugTaken, so the caller picks a new one instead of having to rename
// the live project. Owner tier only (a project owner, or an org owner/admin).
func (d *DB) RestoreProject(ctx context.Context, actorID, orgSlug, projectSlug, newSlug string) (Project, error) {
	var p Project
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		// Several deleted rows may share a slug once it has been reused and
		// re-deleted; restore the newest one still inside the window.
		var projectID string
		if err := tx.QueryRow(ctx,
			`SELECT id FROM public.projects
			 WHERE org_id = $1 AND slug = $2 AND deleted_at IS NOT NULL AND deleted_at > $3
			 ORDER BY deleted_at DESC LIMIT 1`,
			orgID, projectSlug, time.Now().Add(-DeletedRetention)).Scan(&projectID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrProjectNotFound
			}
			return err
		}
		auth, err := resolveProjectAuthority(ctx, tx, orgID, projectID, actorID)
		if err != nil {
			return err
		}
		if !auth.can(ProjCapOwn) {
			return ErrForbidden
		}
		// The UPDATE policy (flagon.project_permits, which ignores deleted_at) lets
		// an owner touch the soft-deleted row; the live-rows-only unique index
		// rejects a slug a live project already uses.
		p, err = scanProject(tx.QueryRow(ctx,
			`UPDATE public.projects
			 SET deleted_at = NULL, slug = COALESCE(NULLIF($2, ''), slug), updated_at = now()
			 WHERE id = $1 AND deleted_at IS NOT NULL
			 RETURNING `+projectCols, projectID, newSlug))
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProjectNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation: slug taken
			return ErrProjectSlugTaken
		}
		if err != nil {
			return err
		}
		summary := "restored project " + p.Name
		if p.Slug != projectSlug {
			summary += " as " + p.Slug
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectRestored, "project", p.Slug, summary)
	})
	return p, err
}
