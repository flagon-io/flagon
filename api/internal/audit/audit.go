// Package audit is Flagon's organization audit subsystem: the single, typed seam
// for recording "who did what, where, and when" and for reading it back.
//
// It is deliberately self-contained so it can graduate from an in-monolith
// Postgres table to a separate audit service without touching call sites:
//
//   - WRITES go through Record, which today appends to public.audit_logs inside
//     the caller's transaction (atomic with the change it records). To move audit
//     to its own service, swap Record's body for a transactional-outbox write
//     (still in the same tx) plus a relay - the call sites and Entry stay put.
//   - READS go through Store, which today queries the same table via a SECURITY
//     DEFINER window. A remote implementation just satisfies the same method.
//   - The vocabulary (Action) lives here, not as ad-hoc strings at call sites, so
//     the write side and the read/filter side can never drift.
package audit

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
)

// Action is a stable, dotted audit action key (resource.verb). Every auditable
// change references one of these constants - add the constant here when you add a
// mutation, so the set stays discoverable and the filter UI can enumerate it.
type Action string

const (
	ActionProjectCreated   Action = "project.created"
	ActionProjectUpdated   Action = "project.updated"
	ActionProjectDeleted   Action = "project.deleted"
	ActionProjectRestored  Action = "project.restored"
	ActionMemberAdded      Action = "member.added"
	ActionMemberRoleChange Action = "member.role_changed"
	ActionMemberRemoved    Action = "member.removed"
	ActionInvitationSent   Action = "invitation.sent"
	ActionInvitationRevoke Action = "invitation.revoked"
	ActionOrgUpdated       Action = "organization.updated"
	ActionOrgAuditConfig   Action = "organization.audit_config_changed"
)

// Actions is the full set, in a sensible display order, for the filter UI and
// for validating input. Keep in sync with the constants above.
var Actions = []Action{
	ActionProjectCreated, ActionProjectUpdated, ActionProjectDeleted, ActionProjectRestored,
	ActionMemberAdded, ActionMemberRoleChange, ActionMemberRemoved,
	ActionInvitationSent, ActionInvitationRevoke,
	ActionOrgUpdated, ActionOrgAuditConfig,
}

// Entry is one append to the log (the write shape). The "where" (IP/country/UA)
// is read from context, not passed here, so call sites stay terse.
type Entry struct {
	OrgID      string
	ActorID    string
	Action     Action
	TargetType string
	TargetID   string
	Summary    string
}

// Event is a materialized log entry with the actor's profile and request context
// joined for display (the read shape). Pointer fields are nil when absent.
type Event struct {
	ID            string    `json:"id"`
	ActorID       *string   `json:"actor_id"`
	ActorName     *string   `json:"actor_name"`
	ActorEmail    *string   `json:"actor_email"`
	ActorUsername *string   `json:"actor_username"`
	ActorAvatar   *string   `json:"actor_avatar_url"`
	Action        string    `json:"action"`
	TargetType    *string   `json:"target_type"`
	TargetID      *string   `json:"target_id"`
	Summary       string    `json:"summary"`
	ActorIP       *string   `json:"actor_ip"`
	ActorCountry  *string   `json:"actor_country"`
	ActorUA       *string   `json:"actor_user_agent"`
	CreatedAt     time.Time `json:"created_at"`
}

// Cursor is an opaque keyset position (newest-first) for pagination. It encodes
// the (created_at, id) of the last row seen; the next page is everything strictly
// older than it.
type Cursor struct {
	CreatedAt time.Time
	ID        string
}

// Encode renders the cursor as a URL-safe opaque token for the `before` param.
func (c Cursor) Encode() string {
	raw := c.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + c.ID
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

// DecodeCursor parses a token from Encode. An empty string yields (nil, nil):
// no cursor, i.e. the first page.
func DecodeCursor(token string) (*Cursor, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, fmt.Errorf("invalid cursor")
	}
	ts, id, ok := strings.Cut(string(raw), "|")
	if !ok {
		return nil, fmt.Errorf("invalid cursor")
	}
	at, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return nil, fmt.Errorf("invalid cursor")
	}
	return &Cursor{CreatedAt: at, ID: id}, nil
}

// Filter narrows a listing. Zero values mean "no filter"; Cursor nil means the
// first page. Limit is clamped by the store.
type Filter struct {
	Query   string   // case-insensitive match on summary/action/actor/location
	Actions []Action // any-of; empty = all
	ActorID string   // exact actor; empty = all
	Cursor  *Cursor  // keyset position; nil = first page
	Limit   int
}

// Page is one slice of results plus the cursor for the following page (nil on the
// last page).
type Page struct {
	Events []Event
	Next   *Cursor
}

// execer is the minimal write surface Record needs; *pgx.Tx and the pool both
// satisfy it. Keeping it an interface (not a concrete tx) is what lets a future
// outbox/remote sink slot in behind Record without changing callers.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Record appends one entry within the caller's transaction, stamping the request
// "where" from context. It funnels through the SECURITY DEFINER helper so no
// runtime role can write to the log directly, and a failure fails the whole
// mutation - audit is not best-effort.
func Record(ctx context.Context, tx execer, e Entry) error {
	ip, country, ua := metaFrom(ctx)
	_, err := tx.Exec(ctx,
		`SELECT flagon.record_audit($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		e.OrgID, e.ActorID, string(e.Action), e.TargetType, e.TargetID, e.Summary, ip, country, ua)
	return err
}

// CtxKey types the context keys carrying request "where" metadata. The HTTP layer
// sets these (from the request/forwarded headers); Record reads them, so mutation
// call sites never thread request details through the domain layer.
type CtxKey string

const (
	CtxIP      CtxKey = "flagon.audit.ip"
	CtxCountry CtxKey = "flagon.audit.country"
	CtxUA      CtxKey = "flagon.audit.user_agent"
)

// WithContext returns ctx carrying the request "where" for any audit entries the
// request records. The HTTP middleware calls this once per request.
func WithContext(ctx context.Context, ip, country, userAgent string) context.Context {
	ctx = context.WithValue(ctx, CtxIP, ip)
	ctx = context.WithValue(ctx, CtxCountry, country)
	return context.WithValue(ctx, CtxUA, userAgent)
}

func metaFrom(ctx context.Context) (ip, country, ua string) {
	ip, _ = ctx.Value(CtxIP).(string)
	country, _ = ctx.Value(CtxCountry).(string)
	ua, _ = ctx.Value(CtxUA).(string)
	return ip, country, ua
}
