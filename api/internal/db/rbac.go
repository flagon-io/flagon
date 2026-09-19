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

// Roles, highest privilege first. owner > admin > member > viewer.
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleMember = "member"
	RoleViewer = "viewer"
)

func roleRank(role string) int {
	switch role {
	case RoleOwner:
		return 4
	case RoleAdmin:
		return 3
	case RoleMember:
		return 2
	case RoleViewer:
		return 1
	default:
		return 0
	}
}

func validRole(role string) bool { return roleRank(role) > 0 }

// Capability is a coarse org-level permission. (Fine-grained per-resource scopes
// and per-project RBAC layer on later.)
type Capability string

const (
	CapRead          Capability = "read"           // view the org and its resources
	CapWrite         Capability = "write"          // create/edit resources (projects, ...)
	CapManageMembers Capability = "members:manage" // invite/remove/change roles
	CapManageTokens  Capability = "tokens:manage"  // org access tokens
	CapManageOrg     Capability = "org:manage"     // org settings
	CapAdminOrg      Capability = "org:admin"      // delete/transfer/billing (owner only)
)

// Can reports whether a role holds a capability. This is the single source of
// truth for "who can do what" at the org level.
func Can(role string, cap Capability) bool {
	switch cap {
	case CapRead:
		return roleRank(role) >= roleRank(RoleViewer)
	case CapWrite:
		return roleRank(role) >= roleRank(RoleMember)
	case CapManageMembers, CapManageTokens, CapManageOrg:
		return roleRank(role) >= roleRank(RoleAdmin)
	case CapAdminOrg:
		return role == RoleOwner
	default:
		return false
	}
}

// Member management errors.
var (
	ErrForbidden       = errors.New("you don't have permission to do that")
	ErrInvalidRole     = errors.New("invalid role")
	ErrUserNotFound    = errors.New("no user with that email or username")
	ErrAlreadyMember   = errors.New("that user is already a member")
	ErrTargetNotMember = errors.New("that user is not a member of this organization")
	ErrLastOwner       = errors.New("an organization must always have an owner")
	ErrSelfManage      = errors.New("you can't change your own membership here")
)

// Member is a user's membership in an org, with their profile details.
type Member struct {
	UserID    string    `json:"user_id"`
	Name      *string   `json:"name"`
	Email     string    `json:"email"`
	Username  *string   `json:"username"`
	AvatarURL *string   `json:"avatar_url"`
	Role      string    `json:"role"`
	JoinedAt  time.Time `json:"joined_at"`
}

// ListMembers returns a page of an org's members (searched by name/email/username,
// ordered by email), but only when the caller is a member (the SECURITY DEFINER
// helper gates on that). Returns the items plus the opaque next cursor.
func (d *DB) ListMembers(ctx context.Context, actorID, slug string, q paginate.Query) ([]Member, string, error) {
	if d == nil || d.pool == nil {
		return nil, "", ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	cur, err := cursorArg(q, 2)
	if err != nil {
		return nil, "", err
	}
	rows, err := d.pool.Query(ctx,
		`SELECT user_id, name, email, username, avatar_url, role, joined_at
		 FROM flagon.org_members($1, $2, $3, $4, $5)`, actorID, slug, q.Q, q.Clamp()+1, cur)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	members := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.UserID, &m.Name, &m.Email, &m.Username, &m.AvatarURL, &m.Role, &m.JoinedAt); err != nil {
			return nil, "", err
		}
		members = append(members, m)
	}
	if err := rows.Err(); err != nil {
		return nil, "", err
	}
	members, next := paginate.Slice(members, q.Clamp(), func(m Member) []string {
		return []string{strings.ToLower(m.Email), m.UserID}
	})
	return members, next, nil
}

// AddMember adds an existing Flagon user (by email or username) to an org. The
// actor must be an owner/admin and may only grant a role at or below their own
// (only an owner can grant owner). Returns the new member's user id + the org
// name (for a welcome notification).
func (d *DB) AddMember(ctx context.Context, actorID, slug, login, role string) (targetID, orgName string, err error) {
	if !validRole(role) {
		return "", "", ErrInvalidRole
	}
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, name, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		orgName = name

		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return ErrForbidden
		}
		// Can't grant a role above your own; only an owner grants owner.
		if roleRank(role) > roleRank(actorRole) {
			return ErrForbidden
		}

		var found *string
		if err := tx.QueryRow(ctx, `SELECT flagon.find_user_by_login($1)`, login).Scan(&found); err != nil {
			return err
		}
		if found == nil {
			return ErrUserNotFound
		}
		targetID = *found

		existing, err := memberRole(ctx, tx, orgID, targetID)
		if err != nil {
			return err
		}
		if existing != "" {
			return ErrAlreadyMember
		}

		if _, err = tx.Exec(ctx,
			`INSERT INTO public.memberships (org_id, user_id, role) VALUES ($1, $2, $3)`,
			orgID, targetID, role); err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionMemberAdded, "member", targetID,
			fmt.Sprintf("added %s as %s", login, role))
	})
	return targetID, orgName, err
}

// SetMemberRole changes a member's role, enforcing the role hierarchy and
// last-owner protection.
func (d *DB) SetMemberRole(ctx context.Context, actorID, slug, targetID, newRole string) error {
	if !validRole(newRole) {
		return ErrInvalidRole
	}
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		if targetID == actorID {
			return ErrSelfManage
		}

		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return ErrForbidden
		}
		targetRole, err := memberRole(ctx, tx, orgID, targetID)
		if err != nil {
			return err
		}
		if targetRole == "" {
			return ErrTargetNotMember
		}

		if err := canManage(actorRole, targetRole, newRole); err != nil {
			return err
		}
		// Demoting the last owner would orphan the org.
		if targetRole == RoleOwner && newRole != RoleOwner {
			if err := ensureNotLastOwner(ctx, tx, orgID); err != nil {
				return err
			}
		}

		if _, err = tx.Exec(ctx,
			`UPDATE public.memberships SET role = $3 WHERE org_id = $1 AND user_id = $2`,
			orgID, targetID, newRole); err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionMemberRoleChange, "member", targetID,
			fmt.Sprintf("changed a member's role to %s", newRole))
	})
}

// RemoveMember removes a member, enforcing the role hierarchy and last-owner
// protection. (A member removes themselves via LeaveOrg, not here.)
func (d *DB) RemoveMember(ctx context.Context, actorID, slug, targetID string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		if targetID == actorID {
			return ErrSelfManage
		}

		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return ErrForbidden
		}
		targetRole, err := memberRole(ctx, tx, orgID, targetID)
		if err != nil {
			return err
		}
		if targetRole == "" {
			return ErrTargetNotMember
		}
		// Only an owner can remove an owner or admin; admins manage members only.
		if actorRole != RoleOwner && roleRank(targetRole) >= roleRank(actorRole) {
			return ErrForbidden
		}
		if targetRole == RoleOwner {
			if err := ensureNotLastOwner(ctx, tx, orgID); err != nil {
				return err
			}
		}

		if _, err = tx.Exec(ctx,
			`DELETE FROM public.memberships WHERE org_id = $1 AND user_id = $2`, orgID, targetID); err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionMemberRemoved, "member", targetID, "removed a member")
	})
}

// UpdateOrg renames an org. Owner/admin only (CapManageOrg). The name is
// assumed already trimmed/non-empty by the caller. Returns the updated org.
func (d *DB) UpdateOrg(ctx context.Context, actorID, slug, name string) (Org, error) {
	var org Org
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if !Can(actorRole, CapManageOrg) {
			return ErrForbidden
		}
		row := tx.QueryRow(ctx,
			`UPDATE public.orgs SET name = $1, updated_at = now()
			 WHERE id = $2 AND deleted_at IS NULL
			 RETURNING id, name, slug, created_at`,
			name, orgID)
		if err := row.Scan(&org.ID, &org.Name, &org.Slug, &org.CreatedAt); err != nil {
			return err
		}
		org.Role = actorRole
		return recordAudit(ctx, tx, org.ID, actorID, audit.ActionOrgUpdated, "organization", org.ID,
			"renamed the organization to "+name)
	})
	return org, err
}

// GetOrg returns a single organization the caller is a member of, with the
// caller's role. Used by expand[]=organization and anywhere a full org object is
// needed from a reference. RLS (resolveOrg) enforces membership.
func (d *DB) GetOrg(ctx context.Context, actorID, slug string) (Org, error) {
	var o Org
	err := d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		role, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if err := tx.QueryRow(ctx,
			`SELECT id, name, slug, enforce_two_factor, require_sso, created_at FROM public.orgs WHERE id = $1`, orgID).
			Scan(&o.ID, &o.Name, &o.Slug, &o.EnforceTwoFactor, &o.RequireSSO, &o.CreatedAt); err != nil {
			return err
		}
		o.Role = role
		return nil
	})
	return o, err
}

// GetAuditConfig returns an org's audit configuration (currently just whether
// actor IP addresses are disclosed in the log). Owners/admins only.
func (d *DB) GetAuditConfig(ctx context.Context, actorID, slug string) (ipDisclosure bool, err error) {
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
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
			`SELECT audit_ip_disclosure FROM public.orgs WHERE id = $1`, orgID).Scan(&ipDisclosure)
	})
	return ipDisclosure, err
}

// SetAuditConfig toggles actor IP disclosure for an org's audit log. Owners/admins
// only. The change is itself recorded to the audit log (a security setting change
// is exactly the kind of thing you audit).
func (d *DB) SetAuditConfig(ctx context.Context, actorID, slug string, ipDisclosure bool) error {
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
		if _, err := tx.Exec(ctx,
			`UPDATE public.orgs SET audit_ip_disclosure = $1, updated_at = now() WHERE id = $2`,
			ipDisclosure, orgID); err != nil {
			return err
		}
		verb := "disabled"
		if ipDisclosure {
			verb = "enabled"
		}
		return recordAudit(ctx, tx, orgID, actorID, audit.ActionOrgAuditConfig, "organization", orgID,
			verb+" actor IP disclosure in the audit log")
	})
}

// canManage enforces the role hierarchy for a role change.
func canManage(actorRole, targetRole, newRole string) error {
	// Only an owner can grant or revoke the owner role.
	if (newRole == RoleOwner || targetRole == RoleOwner) && actorRole != RoleOwner {
		return ErrForbidden
	}
	// An admin can only manage members strictly below them.
	if actorRole != RoleOwner && roleRank(targetRole) >= roleRank(actorRole) {
		return ErrForbidden
	}
	return nil
}

func ensureNotLastOwner(ctx context.Context, tx pgx.Tx, orgID string) error {
	var owners int
	if err := tx.QueryRow(ctx, `SELECT flagon.org_owner_count($1)`, orgID).Scan(&owners); err != nil {
		return err
	}
	if owners <= 1 {
		return ErrLastOwner
	}
	return nil
}

// resolveOrg returns an org's id + name from its slug, in the caller's RLS
// context - so it errors (ErrNotMember) unless the caller can see the org.
func resolveOrg(ctx context.Context, tx pgx.Tx, slug string) (id, name string, err error) {
	err = tx.QueryRow(ctx,
		`SELECT id, name FROM public.orgs WHERE slug = $1 AND deleted_at IS NULL`, slug).
		Scan(&id, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrNotMember
	}
	return id, name, err
}

func memberRole(ctx context.Context, tx pgx.Tx, orgID, userID string) (string, error) {
	var role *string
	if err := tx.QueryRow(ctx, `SELECT flagon.org_member_role($1, $2)`, orgID, userID).Scan(&role); err != nil {
		return "", err
	}
	if role == nil {
		return "", nil
	}
	return *role, nil
}
