package db

import (
	"context"
	"log/slog"
	"time"
)

// RLS self-check sentinels: two fixed orgs seeded by the 0002 migration into
// public.rls_selfcheck. The app role must only ever see the row whose org is
// bound to its transaction.
const (
	rlsSentinelOrgA = "00000000-0000-0000-0000-0000000000a1"
	rlsSentinelOrgB = "00000000-0000-0000-0000-0000000000b2"
)

// RLSReport is the result of the tenant-isolation self-test.
type RLSReport struct {
	Enforced bool     `json:"enforced"`
	OrgA     []string `json:"org_a"`
	OrgB     []string `json:"org_b"`
	NoOrg    []string `json:"no_org"`
	Detail   string   `json:"detail,omitempty"`
}

// CheckRLS runs the tenant-isolation self-test as the app (RLS) role against
// the public.rls_selfcheck fixture: with org A bound to the transaction it must
// see only A's row, with org B only B's, and with no org bound nothing at all
// (fail-closed). It returns the report and whether isolation held, so it can
// back an HTTP endpoint that proves RLS is live without any credentials on the
// caller's side.
func (d *DB) CheckRLS(ctx context.Context) (any, bool) {
	if d == nil || d.pool == nil {
		return RLSReport{Detail: "database unavailable"}, false
	}

	a, err := d.rlsVisibleTags(ctx, rlsSentinelOrgA)
	if err != nil {
		return rlsCheckFailed(ctx, "org_a", err), false
	}
	b, err := d.rlsVisibleTags(ctx, rlsSentinelOrgB)
	if err != nil {
		return rlsCheckFailed(ctx, "org_b", err), false
	}
	none, err := d.rlsVisibleTags(ctx, "")
	if err != nil {
		return rlsCheckFailed(ctx, "no_org", err), false
	}

	enforced := len(a) == 1 && a[0] == "org-a" &&
		len(b) == 1 && b[0] == "org-b" &&
		len(none) == 0
	return RLSReport{Enforced: enforced, OrgA: a, OrgB: b, NoOrg: none}, enforced
}

// rlsCheckFailed logs a self-check query failure server-side and returns a
// report with a generic detail. The report backs an UNAUTHENTICATED endpoint, so
// the raw error (SQL, hostnames, role names) must never reach the response.
func rlsCheckFailed(ctx context.Context, stage string, err error) RLSReport {
	slog.ErrorContext(ctx, "RLS self-check query failed", "stage", stage, "err", err)
	return RLSReport{Detail: "self-check query failed; see the server log"}
}

// rlsVisibleTags returns the tags the app role can see with org bound to the
// current transaction (empty org = none bound). set_config is transaction-local
// (the third arg), so it works even through a transaction-pooling connection
// like pgbouncer, where session state would not survive between statements.
func (d *DB) rlsVisibleTags(ctx context.Context, org string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	tx, err := d.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // no-op (ErrTxClosed) after Commit

	if org != "" {
		if _, err := tx.Exec(ctx, "SELECT set_config('flagon.org_id', $1, true)", org); err != nil {
			return nil, err
		}
	}

	rows, err := tx.Query(ctx, "SELECT tag FROM public.rls_selfcheck ORDER BY tag")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}
