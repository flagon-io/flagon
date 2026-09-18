package audit

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	defaultLimit = 30
	maxLimit     = 100
)

// querier is the minimal read surface Store needs; *pgxpool.Pool satisfies it.
type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Store reads the audit log. It is the read half of the subsystem seam: a remote
// audit service would provide its own type satisfying the same List shape.
type Store struct {
	q querier
}

// NewStore builds a Postgres-backed reader over the given querier (the pool).
func NewStore(q querier) *Store {
	return &Store{q: q}
}

// List returns a page of an org's audit events, newest first, applying the
// filter and keyset cursor. Only owners/admins of the org get rows (enforced in
// the SECURITY DEFINER window). The returned Page.Next is non-nil when more
// results exist.
func (s *Store) List(ctx context.Context, orgSlug, actorID string, f Filter) (Page, error) {
	limit := f.Limit
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	// nil filters map to SQL NULL / '' so the query short-circuits them.
	var actions []string
	if len(f.Actions) > 0 {
		actions = make([]string, len(f.Actions))
		for i, a := range f.Actions {
			actions[i] = string(a)
		}
	}
	var beforeTS *time.Time
	var beforeID *string
	if f.Cursor != nil {
		beforeTS = &f.Cursor.CreatedAt
		beforeID = &f.Cursor.ID
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Fetch one extra row to detect whether a next page exists.
	rows, err := s.q.Query(ctx,
		`SELECT id, actor_id, actor_name, actor_email, actor_username, actor_avatar,
		        action, target_type, target_id, summary, actor_ip, actor_country, actor_ua, created_at
		 FROM flagon.org_audit($1, $2, $3, $4, $5, $6, $7, $8)`,
		actorID, orgSlug, limit+1, f.Query, actions, f.ActorID, beforeTS, beforeID)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()

	events := make([]Event, 0, limit+1)
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorName, &e.ActorEmail, &e.ActorUsername,
			&e.ActorAvatar, &e.Action, &e.TargetType, &e.TargetID, &e.Summary,
			&e.ActorIP, &e.ActorCountry, &e.ActorUA, &e.CreatedAt); err != nil {
			return Page{}, err
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return Page{}, err
	}

	page := Page{Events: events}
	if len(events) > limit {
		last := events[limit-1]
		page.Events = events[:limit]
		page.Next = &Cursor{CreatedAt: last.CreatedAt, ID: last.ID}
	}
	return page, nil
}
