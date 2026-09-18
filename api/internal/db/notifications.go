package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// Notification is one item in a user's notification feed.
type Notification struct {
	ID        string     `json:"id"`
	OrgID     *string    `json:"org_id"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	Body      *string    `json:"body"`
	Link      *string    `json:"link"`
	ReadAt    *time.Time `json:"read_at"`
	CreatedAt time.Time  `json:"created_at"`
}

// ListNotifications returns the caller's notifications, newest first (RLS-scoped
// to the caller).
func (d *DB) ListNotifications(ctx context.Context, userID string, limit int) ([]Notification, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	var out []Notification
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT id, org_id, type, title, body, link, read_at, created_at
			FROM public.notifications
			WHERE user_id = $1
			ORDER BY created_at DESC
			LIMIT $2`, userID, limit)
		if err != nil {
			return err
		}
		defer rows.Close()
		out = []Notification{}
		for rows.Next() {
			var n Notification
			if err := rows.Scan(&n.ID, &n.OrgID, &n.Type, &n.Title, &n.Body, &n.Link, &n.ReadAt, &n.CreatedAt); err != nil {
				return err
			}
			out = append(out, n)
		}
		return rows.Err()
	})
	return out, err
}

// UnreadNotificationCount returns how many of the caller's notifications are unread.
func (d *DB) UnreadNotificationCount(ctx context.Context, userID string) (int, error) {
	var count int
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT count(*) FROM public.notifications WHERE user_id = $1 AND read_at IS NULL`,
			userID).Scan(&count)
	})
	return count, err
}

// MarkNotificationRead marks one of the caller's notifications read.
func (d *DB) MarkNotificationRead(ctx context.Context, userID, id string) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE public.notifications SET read_at = now()
			 WHERE id = $1 AND user_id = $2 AND read_at IS NULL`, id, userID)
		return err
	})
}

// MarkAllNotificationsRead marks all of the caller's notifications read.
func (d *DB) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`UPDATE public.notifications SET read_at = now()
			 WHERE user_id = $1 AND read_at IS NULL`, userID)
		return err
	})
}

// CreateNotification emits a notification to a recipient. Uses the SECURITY
// DEFINER helper, so any actor can notify any user without an RLS insert policy.
// orgID may be nil for account-level notifications.
func (d *DB) CreateNotification(ctx context.Context, userID string, orgID *string, ntype, title, body, link string) error {
	if d == nil || d.pool == nil {
		return ErrUnavailable
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	_, err := d.pool.Exec(ctx,
		`SELECT flagon.create_notification($1, $2::uuid, $3, $4, $5, $6)`,
		userID, orgID, ntype, title, body, link)
	return err
}
