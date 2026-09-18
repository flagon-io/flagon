package ai

import (
	"context"
	"time"
)

// MeterStore is the persistence the DB-backed meter needs. *db.DB satisfies it.
type MeterStore interface {
	RecordAIUsage(ctx context.Context, userID, orgID, model string, inTok, outTok int) error
	AICallsSince(ctx context.Context, userID, orgID string, since time.Time) (int, error)
}

// NewDBMeter returns a Meter that records usage and caps calls per org per
// rolling 24h. dailyLimit <= 0 means unlimited (do not use in production).
func NewDBMeter(store MeterStore, dailyLimit int) Meter {
	return dbMeter{store: store, dailyLimit: dailyLimit}
}

type dbMeter struct {
	store      MeterStore
	dailyLimit int
}

func (m dbMeter) Allowed(ctx context.Context, userID, orgID string) (bool, error) {
	if m.dailyLimit <= 0 {
		return true, nil
	}
	n, err := m.store.AICallsSince(ctx, userID, orgID, time.Now().Add(-24*time.Hour))
	if err != nil {
		return false, err
	}
	return n < m.dailyLimit, nil
}

func (m dbMeter) Record(ctx context.Context, userID, orgID, model string, inTok, outTok int) error {
	return m.store.RecordAIUsage(ctx, userID, orgID, model, inTok, outTok)
}
