package db

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// User is an app user mirrored into the API's database.
type User struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

// Org is an organization plus the caller's role in it.
type Org struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Slug      string    `json:"slug"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

// ErrOrgSlugTaken is returned when creating an org whose slug already exists.
var ErrOrgSlugTaken = errors.New("org slug already taken")

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
		return tx.QueryRow(ctx,
			`SELECT id, name, slug, 'owner', created_at FROM public.orgs WHERE id = $1`,
			orgID).Scan(&o.ID, &o.Name, &o.Slug, &o.Role, &o.CreatedAt)
	})
	return o, err
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
		`SELECT o.id, o.name, o.slug, m.role, o.created_at
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
		if err := rows.Scan(&o.ID, &o.Name, &o.Slug, &o.Role, &o.CreatedAt); err != nil {
			return nil, err
		}
		orgs = append(orgs, o)
	}
	return orgs, rows.Err()
}
