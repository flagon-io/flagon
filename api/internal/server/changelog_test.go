package server

import (
	"net/http"
	"testing"

	"github.com/flagon-io/flagon/api/internal/changelog"
)

func testChangelogLog() *changelog.Log {
	return changelog.New(changelog.Corpus{Entries: []changelog.Entry{
		{Slug: "2026-09-19-ui", Title: "Flagon UI is live", Date: "2026-09-19", Tag: "Shipped", Area: "UI", Body: "Shipped at ui.flagon.io."},
		{Slug: "2026-08-01-api", Title: "Public API", Date: "2026-08-01", Body: "The API is public."},
	}})
}

func TestChangelogEndpoint(t *testing.T) {
	router, _ := New(WithChangelog(testChangelogLog()))
	rec, body := get(t, router, "/changelog")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	entries, ok := body["entries"].([]any)
	if !ok || len(entries) != 2 {
		t.Fatalf("entries = %v, want 2", body["entries"])
	}
	first, _ := entries[0].(map[string]any)
	if first["date"] != "2026-09-19" {
		t.Fatalf("first entry date = %v, want newest first", first["date"])
	}
}

func TestChangelogEndpoint_Unavailable(t *testing.T) {
	router, _ := New()
	rec, _ := get(t, router, "/changelog")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
