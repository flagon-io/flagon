package db

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// invitePrefix namespaces invite tokens (mirrors the access-token prefixes). A
// fresh invitation is valid for 7 days (set in the INSERT below).
const invitePrefix = "flagon_inv"

// Invitation errors.
var (
	// ErrInviteExists is returned when a pending invitation already exists for
	// that org + email.
	ErrInviteExists = errors.New("a pending invitation already exists for that email")
	// ErrInviteNotFound is returned when no invitation matches the token/id.
	ErrInviteNotFound = errors.New("invitation not found")
	// ErrInviteNotPending is returned when accepting an invite that was already
	// accepted or revoked.
	ErrInviteNotPending = errors.New("this invitation is no longer valid")
	// ErrInviteExpired is returned when accepting an expired invitation.
	ErrInviteExpired = errors.New("this invitation has expired")
	// ErrInviteEmailMismatch is returned when the accepting account's email does
	// not match the address the invitation was sent to.
	ErrInviteEmailMismatch = errors.New("this invitation was sent to a different email")
)

// Invitation is a pending (or historical) org invitation, with the inviter's
// display name. The token is never included (only its hash is stored).
type Invitation struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	Inviter   *string   `json:"inviter"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// InviteResult reports what InviteMember did: either the login resolved to an
// existing user who was added directly ("added"), or a pending invitation was
// created for a not-yet-registered email ("invited"). For "invited", Token is
// the single-use plaintext token for the invite link (returned once).
type InviteResult struct {
	Status  string // "added" | "invited"
	OrgName string
	UserID  string     // added: the user who was joined
	Email   string     // invited: the address invited
	Token   string     // invited: plaintext invite token (show once)
	Invite  Invitation // invited: the stored invitation
}

// InviteLookup is the public, pre-auth view of an invitation (by token), for the
// invite landing page. Expired is derived so the UI can explain a dead link.
type InviteLookup struct {
	ID      string `json:"id"`
	OrgSlug string `json:"org_slug"`
	OrgName string `json:"org_name"`
	Email   string `json:"email"`
	Role    string `json:"role"`
	Status  string `json:"status"`
	Expired bool   `json:"expired"`
	Inviter string `json:"inviter"`
}

// looksLikeEmail is a deliberately loose check: something@something with no
// spaces. We only need to decide "invite this address" vs "unknown login".
func looksLikeEmail(s string) bool {
	at := strings.IndexByte(s, '@')
	return at > 0 && at < len(s)-1 && !strings.ContainsAny(s, " \t\r\n") && strings.Contains(s[at+1:], ".")
}

// InviteMember adds an existing user to an org, or (when the login is an email
// with no matching account) creates a pending invitation for them. The actor
// must be an owner/admin and may not grant a role above their own; owner cannot
// be invited. Returns what happened; for an invitation, the plaintext token.
func (d *DB) InviteMember(ctx context.Context, actorID, slug, login, role string) (InviteResult, error) {
	role = strings.TrimSpace(role)
	if role == "" {
		role = RoleMember
	}
	if role == RoleOwner || !validRole(role) {
		return InviteResult{}, ErrInvalidRole
	}
	login = strings.TrimSpace(login)
	if login == "" {
		return InviteResult{}, ErrUserNotFound
	}

	secret, hash, _, err := generateToken(invitePrefix)
	if err != nil {
		return InviteResult{}, err
	}

	var res InviteResult
	err = d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, orgName, err := resolveOrg(ctx, tx, slug)
		if err != nil {
			return err
		}
		res.OrgName = orgName

		actorRole, err := memberRole(ctx, tx, orgID, actorID)
		if err != nil {
			return err
		}
		if actorRole != RoleOwner && actorRole != RoleAdmin {
			return ErrForbidden
		}
		if roleRank(role) > roleRank(actorRole) {
			return ErrForbidden
		}

		// Existing user? Add them straight away (same as AddMember).
		var found *string
		if err := tx.QueryRow(ctx, `SELECT flagon.find_user_by_login($1)`, login).Scan(&found); err != nil {
			return err
		}
		if found != nil {
			targetID := *found
			existing, err := memberRole(ctx, tx, orgID, targetID)
			if err != nil {
				return err
			}
			if existing != "" {
				return ErrAlreadyMember
			}
			if _, err := tx.Exec(ctx,
				`INSERT INTO public.memberships (org_id, user_id, role) VALUES ($1, $2, $3)`,
				orgID, targetID, role); err != nil {
				return err
			}
			res.Status = "added"
			res.UserID = targetID
			return nil
		}

		// Not a Flagon user: we can only invite an email address.
		if !looksLikeEmail(login) {
			return ErrUserNotFound
		}

		var inv Invitation
		err = tx.QueryRow(ctx, `
			INSERT INTO public.org_invitations (org_id, email, role, token_hash, invited_by, expires_at)
			VALUES ($1, $2, $3, $4, $5, now() + interval '7 days')
			RETURNING id, email, role, status, expires_at, created_at`,
			orgID, login, role, hash, actorID).
			Scan(&inv.ID, &inv.Email, &inv.Role, &inv.Status, &inv.ExpiresAt, &inv.CreatedAt)
		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation (pending dupe)
				return ErrInviteExists
			}
			return err
		}
		res.Status = "invited"
		res.Email = login
		res.Token = secret
		res.Invite = inv
		return nil
	})
	if err != nil {
		return InviteResult{}, err
	}
	return res, nil
}

// ListInvitations returns an org's pending invitations, newest first, but only
// when the caller is a member (the SECURITY DEFINER helper gates on that).
func (d *DB) ListInvitations(ctx context.Context, actorID, slug string) ([]Invitation, error) {
	if d == nil || d.pool == nil {
		return nil, ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	rows, err := d.pool.Query(ctx,
		`SELECT id, email, role, status, inviter, expires_at, created_at
		 FROM flagon.org_invitations($1, $2)`, actorID, slug)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	invites := []Invitation{}
	for rows.Next() {
		var inv Invitation
		if err := rows.Scan(&inv.ID, &inv.Email, &inv.Role, &inv.Status, &inv.Inviter, &inv.ExpiresAt, &inv.CreatedAt); err != nil {
			return nil, err
		}
		invites = append(invites, inv)
	}
	return invites, rows.Err()
}

// RevokeInvitation marks a pending invitation revoked. The actor must be an
// owner/admin of the org that owns it.
func (d *DB) RevokeInvitation(ctx context.Context, actorID, slug, inviteID string) error {
	return d.inUserTx(ctx, actorID, func(ctx context.Context, tx pgx.Tx) error {
		orgID, _, err := resolveOrg(ctx, tx, slug)
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
		tag, err := tx.Exec(ctx,
			`UPDATE public.org_invitations SET status = 'revoked'
			 WHERE id = $1 AND org_id = $2 AND status = 'pending'`, inviteID, orgID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrInviteNotFound
		}
		return nil
	})
}

// InvitationByToken resolves a raw invite token to its (public) details. No user
// context is bound: it reads through the SECURITY DEFINER window, since the
// invitee has no session yet. Returns (nil, nil) for an unknown token.
func (d *DB) InvitationByToken(ctx context.Context, token string) (*InviteLookup, error) {
	if d == nil || d.pool == nil {
		return nil, ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var l InviteLookup
	err := d.pool.QueryRow(ctx,
		`SELECT id, org_slug, org_name, email, role, status, expired, COALESCE(inviter, '')
		 FROM flagon.invitation_by_token($1)`, hashToken(token)).
		Scan(&l.ID, &l.OrgSlug, &l.OrgName, &l.Email, &l.Role, &l.Status, &l.Expired, &l.Inviter)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &l, nil
}

// AcceptInvitation joins the given user to the org the token was issued for,
// after checking the invite is pending, unexpired, and addressed to their email.
// Idempotent on the membership. Runs through the SECURITY DEFINER helper (the
// user is not yet a member and cannot see the org under RLS). Returns the org
// slug + name so the caller can route/notify.
func (d *DB) AcceptInvitation(ctx context.Context, userID, email, token string) (orgSlug, orgName, invitedBy string, err error) {
	if d == nil || d.pool == nil {
		return "", "", "", ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var inviter *string
	err = d.pool.QueryRow(ctx,
		`SELECT org_slug, org_name, invited_by FROM flagon.accept_invitation($1, $2, $3)`,
		userID, email, hashToken(token)).Scan(&orgSlug, &orgName, &inviter)
	if err != nil {
		return "", "", "", mapAcceptErr(err)
	}
	if inviter != nil {
		invitedBy = *inviter
	}
	return orgSlug, orgName, invitedBy, nil
}

// mapAcceptErr turns the accept_invitation SQLSTATEs into typed errors.
func mapAcceptErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "P0002", "02000": // no_data_found variants
			return ErrInviteNotFound
		case "22023": // invalid_parameter_value (not pending / expired)
			if strings.Contains(pgErr.Message, "expired") {
				return ErrInviteExpired
			}
			return ErrInviteNotPending
		case "42501": // insufficient_privilege (email mismatch)
			return ErrInviteEmailMismatch
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInviteNotFound
	}
	return err
}
