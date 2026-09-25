package db

import (
	"context"
	"strings"
	"testing"
)

// The RLS self-check backs an unauthenticated endpoint, so a query failure must
// report a generic detail, never the raw driver error (hosts, roles, SQL).
func TestCheckRLS_RedactsQueryErrors(t *testing.T) {
	ctx := context.Background()
	// Nothing listens on port 1; the lazy pool fails on first use.
	d := Open(ctx, Config{AppURL: "postgres://secret_role:pw@127.0.0.1:1/flagon?sslmode=disable&connect_timeout=1"})
	defer d.Close()
	report, ok := d.CheckRLS(ctx)
	if ok {
		t.Fatal("CheckRLS against an unreachable database reported ok")
	}
	r, _ := report.(RLSReport)
	if r.Detail == "" {
		t.Fatal("want a generic detail on failure")
	}
	for _, leak := range []string{"127.0.0.1", "secret_role", "dial", "refused"} {
		if strings.Contains(r.Detail, leak) {
			t.Fatalf("detail %q leaks %q", r.Detail, leak)
		}
	}
}
