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

// Team internal roles. A maintainer can manage the team's own membership; a
// member just belongs. (Distinct from the project role ladder - a team's access
// to a project is a separate grant.)
const (
	TeamRoleMaintainer = "maintainer"
	TeamRoleMember     = "member"
)

// TeamRoles is the selectable set for validation and the membership UI.
var TeamRoles = []string{TeamRoleMaintainer, TeamRoleMember}

func validTeamRole(role string) bool { return role == TeamRoleMaintainer || role == TeamRoleMember }

// Team-related errors.
var (
	ErrTeamNotFound      = errors.New("team not found")
	ErrTeamSlugTaken     = errors.New("a team with that slug already exists")
	ErrAlreadyTeamMember = errors.New("that user is already on this team")
	ErrNotTeamMember     = errors.New("that user is not on this team")
)

// Team is a named group of org members. MemberCount is populated by the listing
// and detail reads.
type Team struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id,omitempty"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	MemberCount int       `json:"member_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at,omitempty"`
}

// TeamInput is the create payload (already trimmed/slugified by the caller).
type TeamInput struct {
	Name        string
	Slug        string
	Description string
}

// TeamUpdate is a partial edit; a nil field is left unchanged.
type TeamUpdate struct {
	Name        *string
	Slug        *string
	Description *string
}

// TeamMember is a member of a team with their profile details and internal role.
type TeamMember struct {
	UserID    string    `json:"user_id"`
	Name      *string   `json:"name"`
	Email     string    `json:"email"`
	Username  *string   `json:"username"`
	AvatarURL *string   `json:"avatar_url"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// TeamProject is a project a team has access to, with the granted role (the
// inverse of ProjectTeam, for a team's Projects tab).
type TeamProject struct {
	ProjectID string    `json:"project_id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ListTeams returns an org's teams with member counts. Any org member may view
// them (the SECURITY DEFINER helper gates on membership).
func (d *DB) ListTeams(ctx context.Context, actorID, orgSlug string, q paginate.Query) ([]Team, string, error) {
	var teams []Team
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		if _, _, err := resolveOrg(ctx, tx, orgSlug); err != nil {
			return err
		}
		cur, err := cursorArg(q, 2)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT id, name, slug, description, member_count, created_at, sort_key
			 FROM flagon.teams($1, $2, $3, $4, $5)`, actorID, orgSlug, q.Q, q.Clamp()+1, cur)
		if err != nil {
			return err
		}
		defer rows.Close()
		teams = []Team{}
		keys := [][]string{}
		for rows.Next() {
			var t Team
			var sk []string
			if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.Description, &t.MemberCount, &t.CreatedAt, &sk); err != nil {
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

// GetTeam returns a single team by slug within an org (any member may view it).
func (d *DB) GetTeam(ctx context.Context, actorID, orgSlug, teamSlug string) (Team, error) {
	var t Team
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		row := tx.QueryRow(ctx,
			`SELECT id, org_id, name, slug, description, created_at, updated_at,
				(SELECT count(*)::int FROM public.team_members tm WHERE tm.team_id = teams.id)
			 FROM public.teams WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`, orgID, teamSlug)
		err = row.Scan(&t.ID, &t.OrgID, &t.Name, &t.Slug, &t.Description, &t.CreatedAt, &t.UpdatedAt, &t.MemberCount)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrTeamNotFound
		}
		return err
	})
	return t, err
}

// CreateTeam creates a team in an org. Org owners/admins only. The creator is
// added as the team's first maintainer (so the team always has someone who can
// manage it). Returns ErrTeamSlugTaken on a duplicate slug.
func (d *DB) CreateTeam(ctx context.Context, actorID, orgSlug string, in TeamInput) (Team, error) {
	var t Team
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return ErrForbidden
		}
		row := tx.QueryRow(ctx,
			`INSERT INTO public.teams (org_id, name, slug, description, created_by)
			 VALUES ($1, $2, $3, $4, $5)
			 RETURNING id, org_id, name, slug, description, created_at, updated_at`,
			orgID, in.Name, in.Slug, in.Description, actorID)
		err = row.Scan(&t.ID, &t.OrgID, &t.Name, &t.Slug, &t.Description, &t.CreatedAt, &t.UpdatedAt)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return ErrTeamSlugTaken
		}
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO public.team_members (team_id, user_id, role, created_by)
			 VALUES ($1, $2, $3, $2)`, t.ID, actorID, TeamRoleMaintainer); err != nil {
			return err
		}
		t.MemberCount = 1
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionTeamCreated, "team", t.Slug, "created team "+t.Name)
	})
	return t, err
}

// UpdateTeam applies a partial edit to a team. Org owners/admins or a team
// maintainer may edit it. Slug is a rename when non-nil.
func (d *DB) UpdateTeam(ctx context.Context, actorID, orgSlug, teamSlug string, in TeamUpdate) (Team, error) {
	var t Team
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := d.resolveTeamAsManager(ctx, tx, actorID, orgSlug, teamSlug)
		if err != nil {
			return err
		}
		row := tx.QueryRow(ctx,
			`UPDATE public.teams SET
				name = COALESCE($1, name),
				slug = COALESCE($2, slug),
				description = COALESCE($3, description),
				updated_at = now()
			 WHERE org_id = $4 AND slug = $5 AND deleted_at IS NULL
			 RETURNING id, org_id, name, slug, description, created_at, updated_at`,
			in.Name, in.Slug, in.Description, orgID, teamSlug)
		err = row.Scan(&t.ID, &t.OrgID, &t.Name, &t.Slug, &t.Description, &t.CreatedAt, &t.UpdatedAt)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrTeamNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return ErrTeamSlugTaken
		}
		if err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionTeamUpdated, "team", t.Slug, "updated team "+t.Name)
	})
	return t, err
}

// DeleteTeam soft-deletes a team, freeing its slug and dropping its project grants
// and ownerships from effect (the helpers ignore soft-deleted teams). Org
// owners/admins only - a maintainer manages a team but does not disband it.
func (d *DB) DeleteTeam(ctx context.Context, actorID, orgSlug, teamSlug string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return ErrForbidden
		}
		ct, err := tx.Exec(ctx,
			`UPDATE public.teams SET deleted_at = now(), updated_at = now()
			 WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`, orgID, teamSlug)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrTeamNotFound
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionTeamDeleted, "team", teamSlug, "deleted team "+teamSlug)
	})
}

// ListTeamMembers returns a team's members with their profiles (any org member).
func (d *DB) ListTeamMembers(ctx context.Context, actorID, orgSlug, teamSlug string, q paginate.Query) ([]TeamMember, string, error) {
	var members []TeamMember
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		if _, err := resolveTeam(ctx, tx, orgID, teamSlug); err != nil {
			return err
		}
		cur, err := cursorArg(q, 2)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT user_id, name, email, username, avatar_url, role, created_at, sort_key
			 FROM flagon.team_members($1, $2, $3, $4, $5, $6)`, actorID, orgSlug, teamSlug, q.Q, q.Clamp()+1, cur)
		if err != nil {
			return err
		}
		defer rows.Close()
		members = []TeamMember{}
		keys := [][]string{}
		for rows.Next() {
			var m TeamMember
			var sk []string
			if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Username, &m.AvatarURL, &m.Role, &m.CreatedAt, &sk); err != nil {
				return err
			}
			members = append(members, m)
			keys = append(keys, sk)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		members, next = paginate.SliceKeyed(members, keys, q.Clamp())
		return nil
	})
	return members, next, err
}

// ListTeamProjects returns the projects a team has access to and the granted
// role (the team's Projects tab). Any org member may view the team, but only the
// projects the CALLER can view are listed (flagon.team_projects, migration 0034).
func (d *DB) ListTeamProjects(ctx context.Context, actorID, orgSlug, teamSlug string, q paginate.Query) ([]TeamProject, string, error) {
	var projects []TeamProject
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		if _, err := resolveTeam(ctx, tx, orgID, teamSlug); err != nil {
			return err
		}
		cur, err := cursorArg(q, 2)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT project_id, name, slug, role, created_at, sort_key
			 FROM flagon.team_projects($1, $2, $3, $4, $5, $6)`, actorID, orgSlug, teamSlug, q.Q, q.Clamp()+1, cur)
		if err != nil {
			return err
		}
		defer rows.Close()
		projects = []TeamProject{}
		keys := [][]string{}
		for rows.Next() {
			var p TeamProject
			var sk []string
			if err := rows.Scan(&p.ProjectID, &p.Name, &p.Slug, &p.Role, &p.CreatedAt, &sk); err != nil {
				return err
			}
			projects = append(projects, p)
			keys = append(keys, sk)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		projects, next = paginate.SliceKeyed(projects, keys, q.Clamp())
		return nil
	})
	return projects, next, err
}

// AddTeamMember adds an existing org member to a team. Org owners/admins or a
// team maintainer may do it. Returns the target's user id.
func (d *DB) AddTeamMember(ctx context.Context, actorID, orgSlug, teamSlug, login, role string) (targetID string, err error) {
	if !validTeamRole(role) {
		return "", ErrInvalidRole
	}
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, teamID, err := d.resolveTeamAsManager(ctx, tx, actorID, orgSlug, teamSlug)
		if err != nil {
			return err
		}
		targetID, err = requireOrgMemberByLogin(ctx, tx, orgID, login)
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx,
			`INSERT INTO public.team_members (team_id, user_id, role, created_by)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (team_id, user_id) DO NOTHING`, teamID, targetID, role, actorID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrAlreadyTeamMember
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionTeamMemberAdded, "team", teamSlug,
			fmt.Sprintf("added %s to team %s as %s", login, teamSlug, role))
	})
	return targetID, err
}

// SetTeamMemberRole changes a team member's internal role.
func (d *DB) SetTeamMemberRole(ctx context.Context, actorID, orgSlug, teamSlug, targetID, role string) error {
	if !validTeamRole(role) {
		return ErrInvalidRole
	}
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, teamID, err := d.resolveTeamAsManager(ctx, tx, actorID, orgSlug, teamSlug)
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx,
			`UPDATE public.team_members SET role = $3, updated_at = now()
			 WHERE team_id = $1 AND user_id = $2`, teamID, targetID, role)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotTeamMember
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionTeamMemberRoleChange, "team", teamSlug,
			fmt.Sprintf("changed a member's role to %s on team %s", role, teamSlug))
	})
}

// RemoveTeamMember removes a member from a team.
func (d *DB) RemoveTeamMember(ctx context.Context, actorID, orgSlug, teamSlug, targetID string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, teamID, err := d.resolveTeamAsManager(ctx, tx, actorID, orgSlug, teamSlug)
		if err != nil {
			return err
		}
		ct, err := tx.Exec(ctx,
			`DELETE FROM public.team_members WHERE team_id = $1 AND user_id = $2`, teamID, targetID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotTeamMember
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionTeamMemberRemoved, "team", teamSlug,
			"removed a member from team "+teamSlug)
	})
}

// resolveTeam returns a live team's id from its slug within an org, in the
// caller's RLS context. Errors ErrTeamNotFound if no live team matches.
func resolveTeam(ctx context.Context, tx pgx.Tx, orgID, slug string) (string, error) {
	var id string
	err := tx.QueryRow(ctx,
		`SELECT id FROM public.teams WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`,
		orgID, slug).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrTeamNotFound
	}
	return id, err
}

// teamMemberRole returns a user's role in a team ("" if not a member).
func teamMemberRole(ctx context.Context, tx pgx.Tx, teamID, userID string) (string, error) {
	var role *string
	if err := tx.QueryRow(ctx, `SELECT flagon.team_member_role($1, $2)`, teamID, userID).Scan(&role); err != nil {
		return "", err
	}
	if role == nil {
		return "", nil
	}
	return *role, nil
}

// resolveTeamAsManager resolves the org + live team and asserts the actor may
// manage it: an org owner/admin or a maintainer of the team. The shared front half
// of the team-membership and team-edit mutations.
func (d *DB) resolveTeamAsManager(ctx context.Context, tx pgx.Tx, actorID, orgSlug, teamSlug string) (orgID, teamID string, err error) {
	orgID, _, err = resolveOrg(ctx, tx, orgSlug)
	if err != nil {
		return "", "", err
	}
	teamID, err = resolveTeam(ctx, tx, orgID, teamSlug)
	if err != nil {
		return "", "", err
	}
	actorRole, err := memberRole(ctx, tx, orgID, actorID)
	if err != nil {
		return "", "", err
	}
	if actorRole == RoleOwner || actorRole == RoleAdmin {
		return orgID, teamID, nil
	}
	teamRole, err := teamMemberRole(ctx, tx, teamID, actorID)
	if err != nil {
		return "", "", err
	}
	if teamRole != TeamRoleMaintainer {
		return "", "", ErrForbidden
	}
	return orgID, teamID, nil
}
