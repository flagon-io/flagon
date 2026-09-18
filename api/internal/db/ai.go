package db

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

// RecordAIUsage records one metered AI call against an org. RLS ensures the
// caller can only write usage for an org they belong to.
func (d *DB) RecordAIUsage(ctx context.Context, userID, orgID, model string, inTok, outTok int) error {
	return d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`INSERT INTO public.ai_usage (org_id, user_id, model, input_tokens, output_tokens)
			 VALUES ($1::uuid, $2, $3, $4, $5)`,
			orgID, userID, model, inTok, outTok)
		return err
	})
}

// AICallsSince counts an org's AI calls since a time, for plan/quota checks.
func (d *DB) AICallsSince(ctx context.Context, userID, orgID string, since time.Time) (int, error) {
	var n int
	err := d.inUserTx(ctx, userID, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx,
			`SELECT count(*) FROM public.ai_usage WHERE org_id = $1::uuid AND created_at >= $2`,
			orgID, since).Scan(&n)
	})
	return n, err
}
