package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

// Project (repo-style) roles, lowest privilege first. The ladder is intentionally
// data, not a hardcoded switch: add a rung here (and to the migration's CHECK)
// and the rank-based capability checks pick it up. read < triage < write <
// maintain < admin, matching the classic repository-role model.
const (
	ProjectRoleRead     = "read"
	ProjectRoleTriage   = "triage"
	ProjectRoleWrite    = "write"
	ProjectRoleMaintain = "maintain"
	ProjectRoleAdmin    = "admin"
)

// projectRoleRanks orders the ladder. A higher rank strictly implies every
// capability of the ranks below it.
var projectRoleRanks = map[string]int{
	ProjectRoleRead:     1,
	ProjectRoleTriage:   2,
	ProjectRoleWrite:    3,
	ProjectRoleMaintain: 4,
	ProjectRoleAdmin:    5,
}

// ProjectRoles is the selectable set, lowest to highest, for validation and the
// grant UI. Keep in sync with the migration's role CHECK constraint.
var ProjectRoles = []string{
	ProjectRoleRead, ProjectRoleTriage, ProjectRoleWrite, ProjectRoleMaintain, ProjectRoleAdmin,
}

func projectRoleRank(role string) int { return projectRoleRanks[role] }

func validProjectRole(role string) bool { return projectRoleRank(role) > 0 }

// BasePermissionNone is the "no floor" base permission - members get no project
// access at all except where explicitly granted. The other base-permission values
// are the project-role strings themselves (read..admin).
const BasePermissionNone = "none"

// impliedProjectRole maps an org role to the project role it grants on every
// project in the org (the floor), GitHub-style: owners/admins are admins
// everywhere; a plain member's floor is the org's BASE PERMISSION (default read,
// or none for no floor). "" means no implied access (non-member, or a member in a
// base=none org). "viewer" is legacy (folded into member by migration 0023) and
// maps to read for any rows that predate the change.
func impliedProjectRole(orgRole, basePermission string) string {
	switch orgRole {
	case RoleOwner, RoleAdmin:
		return ProjectRoleAdmin
	case RoleMember:
		if basePermission == BasePermissionNone || basePermission == "" {
			return ""
		}
		return basePermission
	case RoleViewer:
		return ProjectRoleRead
	default:
		return ""
	}
}

// EffectiveProjectRole is max(org-implied, explicit grant): a grant can only
// elevate a member on a specific project, never drop them below their org floor
// (the base permission). An empty grant means "no explicit grant" and yields the
// org-implied role.
func EffectiveProjectRole(orgRole, basePermission, grant string) string {
	implied := impliedProjectRole(orgRole, basePermission)
	if projectRoleRank(grant) > projectRoleRank(implied) {
		return grant
	}
	return implied
}

// ProjectCapability is a coarse per-project permission, checked by minimum role
// rank so the ladder stays the single source of truth. Distinct powers for
// triage/maintain land as the deploy features they gate arrive; today the
// wired-up gates are view (read), write (write) and admin.
type ProjectCapability string

const (
	ProjCapView   ProjectCapability = "project:view"   // see the project and its collaborators (read+)
	ProjCapWrite  ProjectCapability = "project:write"  // edit project metadata (write+)
	ProjCapManage ProjectCapability = "project:manage" // manage project settings/environments (maintain+)
	ProjCapAdmin  ProjectCapability = "project:admin"  // manage collaborators/teams (admin+)
	ProjCapOwn    ProjectCapability = "project:own"    // delete/restore, transfer, manage owners (owner tier)
)

// ProjectCan reports whether an effective project ROLE (the read..admin ladder)
// holds a capability. Ownership is a separate tier above the ladder and is not
// expressible as a role, so ProjCapOwn is never satisfied by a role alone - use
// projectAuthority.can, which folds ownership in. The single source of truth for
// "who can do what" on a project by role.
func ProjectCan(role string, cap ProjectCapability) bool {
	rank := projectRoleRank(role)
	switch cap {
	case ProjCapView:
		return rank >= projectRoleRank(ProjectRoleRead)
	case ProjCapWrite:
		return rank >= projectRoleRank(ProjectRoleWrite)
	case ProjCapManage:
		return rank >= projectRoleRank(ProjectRoleMaintain)
	case ProjCapAdmin:
		return rank >= projectRoleRank(ProjectRoleAdmin)
	default:
		// ProjCapOwn (and any unknown capability) needs ownership, not a role.
		return false
	}
}

// projectAuthority is a user's resolved authority on a project: their effective
// role on the read..admin ladder (the higher of the org floor, their explicit
// user grant, and any team grant) plus whether they are an OWNER. Ownership is a
// separate relation a tier above admin (held directly, via a team, or implicitly
// by every org owner/admin) and grants every project capability.
type projectAuthority struct {
	Role  string
	Owner bool
}

// can reports whether the authority holds a capability. An owner holds every
// capability (including ProjCapOwn); otherwise the role ladder decides.
func (a projectAuthority) can(cap ProjectCapability) bool {
	if a.Owner {
		return true
	}
	return ProjectCan(a.Role, cap)
}

// maxProjectRole returns the higher-ranked of two project roles ("" ranks 0).
func maxProjectRole(a, b string) string {
	if projectRoleRank(b) > projectRoleRank(a) {
		return b
	}
	return a
}

// Project collaborator errors.
var (
	ErrAlreadyCollaborator = errors.New("that user already has a role on this project")
	ErrNotCollaborator     = errors.New("that user has no role on this project")
)

// ProjectMember is an explicit collaborator grant with the user's profile
// details. Org-level (implicit) access is not represented here.
type ProjectMember struct {
	UserID    string    `json:"user_id"`
	Name      *string   `json:"name"`
	Email     string    `json:"email"`
	Username  *string   `json:"username"`
	AvatarURL *string   `json:"avatar_url"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ListProjectMembers returns a project's explicit collaborator grants. Any org
// member may view them (the SECURITY DEFINER helper gates on org membership).
// Errors ErrNotMember / ErrProjectNotFound if the caller can't see the project.
func (d *DB) ListProjectMembers(ctx context.Context, actorID, orgSlug, projectSlug string, q paginate.Query) ([]ProjectMember, string, error) {
	var members []ProjectMember
	var next string
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, orgSlug)
		if err != nil {
			return err
		}
		if _, err := resolveProject(ctx, tx, orgID, projectSlug); err != nil {
			return err
		}
		cur, err := cursorArg(q, 2)
		if err != nil {
			return err
		}
		rows, err := tx.Query(ctx,
			`SELECT user_id, name, email, username, avatar_url, role, created_at
			 FROM flagon.project_members($1, $2, $3, $4, $5, $6)`, actorID, orgSlug, projectSlug, q.Q, q.Clamp()+1, cur)
		if err != nil {
			return err
		}
		defer rows.Close()
		members = []ProjectMember{}
		for rows.Next() {
			var m ProjectMember
			if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Username, &m.AvatarURL, &m.Role, &m.CreatedAt); err != nil {
				return err
			}
			members = append(members, m)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		members, next = paginate.Slice(members, q.Clamp(), func(m ProjectMember) []string {
			return []string{strings.ToLower(m.Email), m.UserID}
		})
		return nil
	})
	return members, next, err
}

// AddProjectMember grants an existing org member a role on a project. The actor
// must be an effective project admin (org owner/admin, or an explicit admin
// grant). The target must already be an org member (grants elevate members;
// outside collaborators are a later seam). Returns the target's user id.
func (d *DB) AddProjectMember(ctx context.Context, actorID, orgSlug, projectSlug, login, role string) (targetID string, err error) {
	if !validProjectRole(role) {
		return "", ErrInvalidRole
	}
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAsAdmin(ctx, tx, actorID, orgSlug, projectSlug)
		if err != nil {
			return err
		}
		targetID, err = requireOrgMemberByLogin(ctx, tx, orgID, login)
		if err != nil {
			return err
		}
		if targetID == actorID {
			return ErrSelfManage
		}
		ct, err := tx.Exec(ctx,
			`INSERT INTO public.project_members (project_id, user_id, role, created_by)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (project_id, user_id) DO NOTHING`,
			projectID, targetID, role, actorID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrAlreadyCollaborator
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectAccessGranted, "project", projectSlug,
			fmt.Sprintf("granted %s %s on %s", login, role, projectSlug))
	})
	return targetID, err
}

// SetProjectMemberRole changes an existing collaborator's role. Actor must be an
// effective project admin; the target must already hold a grant.
func (d *DB) SetProjectMemberRole(ctx context.Context, actorID, orgSlug, projectSlug, targetID, role string) error {
	if !validProjectRole(role) {
		return ErrInvalidRole
	}
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAsAdmin(ctx, tx, actorID, orgSlug, projectSlug)
		if err != nil {
			return err
		}
		if targetID == actorID {
			return ErrSelfManage
		}
		ct, err := tx.Exec(ctx,
			`UPDATE public.project_members SET role = $3, updated_at = now()
			 WHERE project_id = $1 AND user_id = $2`,
			projectID, targetID, role)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotCollaborator
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectAccessChanged, "project", projectSlug,
			fmt.Sprintf("changed a collaborator's role to %s on %s", role, projectSlug))
	})
}

// RemoveProjectMember revokes a collaborator's grant (dropping them back to their
// org-implied role). Actor must be an effective project admin.
func (d *DB) RemoveProjectMember(ctx context.Context, actorID, orgSlug, projectSlug, targetID string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, projectID, err := d.resolveOrgProjectAsAdmin(ctx, tx, actorID, orgSlug, projectSlug)
		if err != nil {
			return err
		}
		if targetID == actorID {
			return ErrSelfManage
		}
		ct, err := tx.Exec(ctx,
			`DELETE FROM public.project_members WHERE project_id = $1 AND user_id = $2`,
			projectID, targetID)
		if err != nil {
			return err
		}
		if ct.RowsAffected() == 0 {
			return ErrNotCollaborator
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionProjectAccessRevoked, "project", projectSlug,
			"revoked a collaborator's access to "+projectSlug)
	})
}

// resolveProject returns a live project's id from its slug within an org, in the
// caller's RLS context. Errors ErrProjectNotFound if no live project matches.
func resolveProject(ctx context.Context, tx pgx.Tx, orgID, slug string) (string, error) {
	var id string
	err := tx.QueryRow(ctx,
		`SELECT id FROM public.projects WHERE org_id = $1 AND slug = $2 AND deleted_at IS NULL`,
		orgID, slug).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrProjectNotFound
	}
	return id, err
}

// projectGrant returns a user's explicit project grant ("" if none).
func projectGrant(ctx context.Context, tx pgx.Tx, projectID, userID string) (string, error) {
	var role *string
	if err := tx.QueryRow(ctx, `SELECT flagon.project_member_role($1, $2)`, projectID, userID).Scan(&role); err != nil {
		return "", err
	}
	if role == nil {
		return "", nil
	}
	return *role, nil
}

// orgBasePermission reads an org's base permission (the member project-access
// floor). Runs in the caller's tx; the org is already resolved/visible.
func orgBasePermission(ctx context.Context, tx pgx.Tx, orgID string) (string, error) {
	var base string
	err := tx.QueryRow(ctx, `SELECT base_permission FROM public.orgs WHERE id = $1`, orgID).Scan(&base)
	return base, err
}

// effectiveProjectRole computes the actor's effective role on a project from
// their org role, the org's base permission, and any explicit grant. This is the
// role-ladder view only (no ownership); most callers want resolveProjectAuthority.
func effectiveProjectRole(ctx context.Context, tx pgx.Tx, orgID, projectID, userID string) (string, error) {
	orgRole, err := memberRole(ctx, tx, orgID, userID)
	if err != nil {
		return "", err
	}
	base, err := orgBasePermission(ctx, tx, orgID)
	if err != nil {
		return "", err
	}
	grant, err := projectGrant(ctx, tx, projectID, userID)
	if err != nil {
		return "", err
	}
	return EffectiveProjectRole(orgRole, base, grant), nil
}

// projectTeamGrant returns the highest role a user is granted on a project through
// any team they belong to ("" if none).
func projectTeamGrant(ctx context.Context, tx pgx.Tx, projectID, userID string) (string, error) {
	var role *string
	if err := tx.QueryRow(ctx, `SELECT flagon.project_team_role($1, $2)`, projectID, userID).Scan(&role); err != nil {
		return "", err
	}
	if role == nil {
		return "", nil
	}
	return *role, nil
}

// userOwnsProject reports whether a user owns a project directly or via a team.
func userOwnsProject(ctx context.Context, tx pgx.Tx, projectID, userID string) (bool, error) {
	var owns bool
	err := tx.QueryRow(ctx, `SELECT flagon.user_owns_project($1, $2)`, projectID, userID).Scan(&owns)
	return owns, err
}

// resolveProjectAuthority computes the actor's full authority on a project: the
// effective role (max of the org floor, their user grant, and any team grant) plus
// ownership. Org owners/admins always resolve to owner-level authority, so the org
// is never locked out of its own project.
func resolveProjectAuthority(ctx context.Context, tx pgx.Tx, orgID, projectID, userID string) (projectAuthority, error) {
	orgRole, err := memberRole(ctx, tx, orgID, userID)
	if err != nil {
		return projectAuthority{}, err
	}
	if orgRole == RoleOwner || orgRole == RoleAdmin {
		return projectAuthority{Role: ProjectRoleAdmin, Owner: true}, nil
	}
	base, err := orgBasePermission(ctx, tx, orgID)
	if err != nil {
		return projectAuthority{}, err
	}
	userGrant, err := projectGrant(ctx, tx, projectID, userID)
	if err != nil {
		return projectAuthority{}, err
	}
	teamGrant, err := projectTeamGrant(ctx, tx, projectID, userID)
	if err != nil {
		return projectAuthority{}, err
	}
	role := maxProjectRole(impliedProjectRole(orgRole, base), maxProjectRole(userGrant, teamGrant))
	owns, err := userOwnsProject(ctx, tx, projectID, userID)
	if err != nil {
		return projectAuthority{}, err
	}
	return projectAuthority{Role: role, Owner: owns}, nil
}

// resolveOrgProjectAsAdmin resolves the org + live project and asserts the actor
// can administer the project's access (effective admin or owner). The shared front
// half of every access-grant mutation.
func (d *DB) resolveOrgProjectAsAdmin(ctx context.Context, tx pgx.Tx, actorID, orgSlug, projectSlug string) (orgID, projectID string, err error) {
	orgID, projectID, _, err = d.resolveOrgProjectAuthority(ctx, tx, actorID, orgSlug, projectSlug, ProjCapAdmin)
	return orgID, projectID, err
}

// resolveOrgProjectAuthority resolves the org + live project, computes the actor's
// authority, and asserts it holds cap. Errors ErrForbidden otherwise.
func (d *DB) resolveOrgProjectAuthority(ctx context.Context, tx pgx.Tx, actorID, orgSlug, projectSlug string, cap ProjectCapability) (orgID, projectID string, auth projectAuthority, err error) {
	orgID, _, err = resolveOrg(ctx, tx, orgSlug)
	if err != nil {
		return "", "", projectAuthority{}, err
	}
	projectID, err = resolveProject(ctx, tx, orgID, projectSlug)
	if err != nil {
		return "", "", projectAuthority{}, err
	}
	auth, err = resolveProjectAuthority(ctx, tx, orgID, projectID, actorID)
	if err != nil {
		return "", "", projectAuthority{}, err
	}
	if !auth.can(cap) {
		return "", "", projectAuthority{}, ErrForbidden
	}
	return orgID, projectID, auth, nil
}

// requireOrgMemberByLogin resolves a user by email/username and asserts they are
// a member of the org (collaborators are org members). Returns their user id.
func requireOrgMemberByLogin(ctx context.Context, tx pgx.Tx, orgID, login string) (string, error) {
	var found *string
	if err := tx.QueryRow(ctx, `SELECT flagon.find_user_by_login($1)`, login).Scan(&found); err != nil {
		return "", err
	}
	if found == nil {
		return "", ErrUserNotFound
	}
	role, err := memberRole(ctx, tx, orgID, *found)
	if err != nil {
		return "", err
	}
	if role == "" {
		return "", ErrTargetNotMember
	}
	return *found, nil
}
