package db

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// User is an app user mirrored into the API's database.
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// Org is an organization plus the caller's role in it.
type Org struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Role string `json:"role"`
	// EnforceTwoFactor and RequireSSO are the org's security policy. They travel on
	// the org object so the app gate can enforce them for every member without a
	// second round-trip. Written via SetOrgSecurity (owner/admin only).
	EnforceTwoFactor bool      `json:"enforce_two_factor"`
	RequireSSO       bool      `json:"require_sso"`
	CreatedAt        time.Time `json:"created_at"`
}

// ErrOrgSlugTaken is returned when creating an org whose slug already exists.
var ErrOrgSlugTaken = errors.New("org slug already taken")

// ErrUsernameTaken is returned when mirroring a profile whose username collides
// with another user's.
var ErrUsernameTaken = errors.New("username already taken")

// ErrOrgLimitReached is returned when a user tries to create more owned orgs than
// their plan allows (the free plan includes one; more need a payment method).
var ErrOrgLimitReached = errors.New("organization limit reached")

// ErrNotMember is returned when acting on an org the caller doesn't belong to.
var ErrNotMember = errors.New("not a member of that organization")

// ErrSoleOwner is returned when the only owner tries to leave an org (they must
// transfer ownership or delete the org first).
var ErrSoleOwner = errors.New("cannot leave: you are the only owner")

// freeOwnedOrgLimit is how many orgs a user may OWN without a payment method on
// file. Being a member (invited) of other orgs is always unlimited.
const freeOwnedOrgLimit = 1

// ProfileInput is the public profile mirrored from the app (BetterAuth). Empty
// strings are stored as NULL; SocialLinks is stored as a jsonb array.
type ProfileInput struct {
	Username    string
	Name        string
	Bio         string
	Pronouns    string
	WebsiteURL  string
	Company     string
	Location    string
	SocialLinks []string
	PublicEmail string
	AvatarURL   string
}

// PublicProfile is the GitHub-style public view of a user. Optional fields are
// pointers so an unset value serializes as JSON null (not an empty string).
type PublicProfile struct {
	ID          string    `json:"id"`
	Username    string    `json:"username"`
	Name        *string   `json:"name"`
	Bio         *string   `json:"bio"`
	Pronouns    *string   `json:"pronouns"`
	WebsiteURL  *string   `json:"website_url"`
	Company     *string   `json:"company"`
	Location    *string   `json:"location"`
	SocialLinks []string  `json:"social_links"`
	PublicEmail *string   `json:"public_email"`
	AvatarURL   *string   `json:"avatar_url"`
	CreatedAt   time.Time `json:"created_at"`
}

// inUserTx runs fn in a transaction with the RLS user context bound to userID,
// so every query fn issues is row-level-security scoped to that user. The bind
// is transaction-local, so it is correct even through a transaction-pooling
// connection (pgbouncer).
func (d *DB) inUserTx(ctx context.Context, userID string, fn func(context.Context, pgx.Tx) error) error {
	if d == nil || d.pool == nil {
		return ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT set_config('flagon.user_id', $1, true)", userID); err != nil {
		return err
	}
	if err := fn(ctx, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// Me upserts the caller's user record (mirroring the app's BetterAuth user) and
// returns it together with the orgs the caller belongs to.
func (d *DB) Me(ctx context.Context, userID, email string) (User, []Org, error) {
	var u User
	var orgs []Org
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		if err := upsertUser(ctx, tx, userID, email).Scan(&u.ID, &u.Email, &u.CreatedAt); err != nil {
			return err
		}
		var e error
		orgs, e = queryOrgs(ctx, tx, userID)
		return e
	})
	return u, orgs, err
}

// SetUserDeleted mirrors the account's soft-delete state into the domain (the
// app decides it, via BetterAuth) so the public profile read can hide deleted
// accounts. Acts as the user (self-update, allowed by the users_self policy).
func (d *DB) SetUserDeleted(ctx context.Context, userID string, deleted bool) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		// A not-yet-mirrored user has no public profile, so a 0-row update is fine.
		q := `UPDATE public.users SET deleted_at = NULL, updated_at = now() WHERE id = $1`
		if deleted {
			q = `UPDATE public.users SET deleted_at = now(), updated_at = now() WHERE id = $1`
		}
		_, err := tx.Exec(ctx, q, userID)
		return err
	})
}

// ListOrgs returns the orgs the caller belongs to.
func (d *DB) ListOrgs(ctx context.Context, userID string) ([]Org, error) {
	var orgs []Org
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		var e error
		orgs, e = queryOrgs(ctx, tx, userID)
		return e
	})
	return orgs, err
}

// CreateOrg creates an org and makes the caller its owner, in one transaction.
// It ensures the caller's user record exists first (FK target). A duplicate
// slug returns ErrOrgSlugTaken.
func (d *DB) CreateOrg(ctx context.Context, userID, email, name, slug string) (Org, error) {
	var o Org
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := upsertUserExec(ctx, tx, userID, email); err != nil {
			return err
		}

		// Plan gate: the free plan includes one OWNED org; more require a payment
		// method (billing isn't built yet, so for now this caps owned orgs at the
		// free limit). When billing lands, allow past the limit if the user has a
		// card on file. Runs inside the caller's RLS context, so it only counts
		// the caller's own memberships.
		var owned int
		if err := tx.QueryRow(ctx, `
			SELECT count(*) FROM public.memberships m
			JOIN public.orgs o ON o.id = m.org_id
			WHERE m.user_id = $1 AND m.role = 'owner' AND o.deleted_at IS NULL`,
			userID).Scan(&owned); err != nil {
			return err
		}
		if owned >= freeOwnedOrgLimit {
			return ErrOrgLimitReached
		}

		// Generate the id up front so we avoid INSERT ... RETURNING, which would
		// trip the orgs SELECT policy on a row that has no owner membership yet.
		var orgID string
		if err := tx.QueryRow(ctx, "SELECT gen_random_uuid()").Scan(&orgID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO public.orgs (id, name, slug) VALUES ($1, $2, $3)`,
			orgID, name, slug); err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
				return ErrOrgSlugTaken
			}
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO public.memberships (org_id, user_id, role) VALUES ($1, $2, 'owner')`,
			orgID, userID); err != nil {
			return err
		}

		// Now visible via the membership - read the full record back.
		if err := tx.QueryRow(ctx,
			`SELECT id, name, slug, 'owner', enforce_two_factor, require_sso, created_at FROM public.orgs WHERE id = $1`,
			orgID).Scan(&o.ID, &o.Name, &o.Slug, &o.Role, &o.EnforceTwoFactor, &o.RequireSSO, &o.CreatedAt); err != nil {
			return err
		}

		return recordAudit(ctx, tx, orgID, userID, audit.ActionOrgCreated, "organization", orgID,
			"created organization "+name)
	})
	return o, err
}

// UpsertUserProfile mirrors the caller's public profile from the app into their
// own users row. It runs in the caller's RLS context (users_self), so a user can
// only ever write their own row. Empty strings become NULL.
func (d *DB) UpsertUserProfile(ctx context.Context, userID, email string, p ProfileInput) error {
	social := p.SocialLinks
	if social == nil {
		social = []string{}
	}
	socialJSON, err := json.Marshal(social)
	if err != nil {
		return err
	}

	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO public.users
				(id, email, username, name, bio, pronouns, website_url, company, location, social_links, public_email, avatar_url)
			VALUES
				($1, $2, NULLIF($3,''), NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''),
				 NULLIF($8,''), NULLIF($9,''), $10::jsonb, NULLIF($11,''), NULLIF($12,''))
			ON CONFLICT (id) DO UPDATE SET
				email        = EXCLUDED.email,
				username     = EXCLUDED.username,
				name         = EXCLUDED.name,
				bio          = EXCLUDED.bio,
				pronouns     = EXCLUDED.pronouns,
				website_url  = EXCLUDED.website_url,
				company      = EXCLUDED.company,
				location     = EXCLUDED.location,
				social_links = EXCLUDED.social_links,
				public_email = EXCLUDED.public_email,
				avatar_url   = EXCLUDED.avatar_url,
				updated_at   = now()`,
			userID, email, p.Username, p.Name, p.Bio, p.Pronouns, p.WebsiteURL,
			p.Company, p.Location, string(socialJSON), p.PublicEmail, p.AvatarURL)
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation (username)
			return ErrUsernameTaken
		}
		return err
	})
}

// PublicUserProfile returns a user's public profile by username, or (nil, nil)
// when no such user exists. It reads through the SECURITY DEFINER
// public.user_profile function, which is the only public window past users' RLS
// and exposes public columns only - so no user context is bound here.
func (d *DB) PublicUserProfile(ctx context.Context, username string) (*PublicProfile, error) {
	if d == nil || d.pool == nil {
		return nil, ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var p PublicProfile
	var social []byte
	err := d.pool.QueryRow(ctx, `
		SELECT id, username, name, bio, pronouns, website_url, company, location,
		       social_links, public_email, avatar_url, created_at
		FROM public.user_profile($1)`, username).
		Scan(&p.ID, &p.Username, &p.Name, &p.Bio, &p.Pronouns, &p.WebsiteURL,
			&p.Company, &p.Location, &social, &p.PublicEmail, &p.AvatarURL, &p.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(social) > 0 {
		_ = json.Unmarshal(social, &p.SocialLinks)
	}
	if p.SocialLinks == nil {
		p.SocialLinks = []string{}
	}
	return &p, nil
}

// LeaveOrg removes the caller's membership from an org. The sole remaining owner
// can't leave (RLS lets a user delete only their own membership; the owner count
// comes from a SECURITY DEFINER helper since they can't see co-members).
func (d *DB) LeaveOrg(ctx context.Context, userID, slug string) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		var orgID, role string
		err := tx.QueryRow(ctx, `
			SELECT o.id, m.role
			FROM public.orgs o
			JOIN public.memberships m ON m.org_id = o.id
			WHERE o.slug = $1 AND m.user_id = $2 AND o.deleted_at IS NULL`,
			slug, userID).Scan(&orgID, &role)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotMember
		}
		if err != nil {
			return err
		}

		if role == "owner" {
			var owners int
			if err := tx.QueryRow(ctx, `SELECT flagon.org_owner_count($1)`, orgID).Scan(&owners); err != nil {
				return err
			}
			if owners <= 1 {
				return ErrSoleOwner
			}
		}

		if _, err = tx.Exec(ctx,
			`DELETE FROM public.memberships WHERE org_id = $1 AND user_id = $2`, orgID, userID); err != nil {
			return err
		}
		return recordAudit(ctx, tx, orgID, userID, audit.ActionMemberLeft, "member", userID,
			"left the organization")
	})
}

func upsertUser(ctx context.Context, tx pgx.Tx, userID, email string) pgx.Row {
	return tx.QueryRow(ctx,
		`INSERT INTO public.users (id, email) VALUES ($1, $2)
		 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
		 RETURNING id, email, created_at`, userID, email)
}

func upsertUserExec(ctx context.Context, tx pgx.Tx, userID, email string) (pgconn.CommandTag, error) {
	return tx.Exec(ctx,
		`INSERT INTO public.users (id, email) VALUES ($1, $2)
		 ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()`, userID, email)
}

func queryOrgs(ctx context.Context, tx pgx.Tx, userID string) ([]Org, error) {
	rows, err := tx.Query(ctx,
		`SELECT o.id, o.name, o.slug, m.role, o.enforce_two_factor, o.require_sso, o.created_at
		 FROM public.orgs o
		 JOIN public.memberships m ON m.org_id = o.id
		 WHERE m.user_id = $1 AND o.deleted_at IS NULL
		 ORDER BY o.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	orgs := []Org{}
	for rows.Next() {
		var o Org
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.Role, &o.EnforceTwoFactor, &o.RequireSSO, &o.CreatedAt); err != nil {
			return nil, err
		}
		orgs = append(orgs, o)
	}
	return orgs, rows.Err()
}
