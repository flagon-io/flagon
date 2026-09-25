package server

import (
	"context"
	"testing"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// limitStore records the page size the service asks the store for.
type limitStore struct {
	fakeStore
	got *int
}

func (l limitStore) ListNotifications(_ context.Context, _ string, n int) ([]db.Notification, error) {
	*l.got = n
	return nil, nil
}

func (l limitStore) ListAuditLog(_ context.Context, _, _ string, n int) ([]db.AuditEvent, error) {
	*l.got = n
	return nil, nil
}

// A limit above the cap is clamped to the cap (100), never reset to the default
// (30); an unset limit is the default. REST and the tools share this service.
func TestListLimitsClampToMax(t *testing.T) {
	var got int
	svc := service.New(limitStore{fakeStore: newFakeStore(nil), got: &got})
	a := service.Actor{UserID: "u1"}
	for in, want := range map[int]int{0: 30, 50: 50, 101: 100, 1000: 100} {
		if _, err := svc.ListNotifications(context.Background(), a, in); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("notifications limit %d -> %d, want %d", in, got, want)
		}
		if _, err := svc.ListAuditLog(context.Background(), a, "acme", in); err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Errorf("audit limit %d -> %d, want %d", in, got, want)
		}
	}
}
