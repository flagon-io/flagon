package db

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/flagon-io/flagon/api/internal/audit"
)

// AuditEvent is the audit read shape, owned by the internal/audit subsystem and
// aliased here for callers that already reference db.AuditEvent (e.g. the AI tool
// store). New code should prefer audit.Event.
type AuditEvent = audit.Event

// ListAuditLog returns an org's recent audit events (owners/admins only), newest
// first. It is the simple "recent N" read for the AI tool; the rich, filtered,
// paginated read path is audit.Store, used directly by the HTTP layer.
func (d *DB) ListAuditLog(ctx context.Context, actorID, slug string, limit int) ([]audit.Event, error) {
	if d == nil || d.pool == nil {
		return nil, ErrUnavailable
	}
	page, err := audit.NewStore(d.pool).List(ctx, slug, actorID, audit.Filter{Limit: limit})
	if err != nil {
		return nil, err
	}
	return page.Events, nil
}

// recordAudit appends one audit entry inside the caller's transaction. It is a
// thin, ergonomic wrapper over audit.Record so mutation sites read cleanly; the
// action is a typed constant from the audit package (never an ad-hoc string).
func recordAudit(ctx context.Context, tx pgx.Tx, orgID, actorID string, action audit.Action, targetType, targetID, summary string) error {
	return audit.Record(ctx, tx, audit.Entry{
		OrgID:      orgID,
		ActorID:    actorID,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Summary:    summary,
	})
}
