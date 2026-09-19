package server

import (
	"net/http"
	"testing"

	"github.com/flagon-io/flagon/api/internal/roadmap"
)

// testRoadmapBoard builds a small, controlled board so the HTTP test is
// deterministic and independent of the real embedded corpus.
func testRoadmapBoard() *roadmap.Board {
	return roadmap.New(roadmap.Corpus{Items: []roadmap.Item{
		{Slug: "platform", Title: "The platform", Stage: roadmap.Concept, Team: "Engineering", Tag: "Foundation", Summary: "The foundation.", Includes: []string{"Multi-tenant"}},
		{Slug: "sync", Title: "Sync", Stage: roadmap.Alpha, Team: "Integrations"},
	}})
}

func TestRoadmapEndpoint(t *testing.T) {
	router, _ := New(WithRoadmap(testRoadmapBoard()))
	rec, body := get(t, router, "/roadmap")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	items, ok := body["items"].([]any)
	if !ok || len(items) != 2 {
		t.Fatalf("items = %v, want 2", body["items"])
	}
	if stages, ok := body["stages"].([]any); !ok || len(stages) != 3 {
		t.Fatalf("stages = %v, want 3 columns", body["stages"])
	}
	teams, ok := body["teams"].([]any)
	if !ok || len(teams) != 2 {
		t.Fatalf("teams = %v, want 2", body["teams"])
	}
}

func TestRoadmapEndpoint_Unavailable(t *testing.T) {
	// A nil board (corpus failed to load) reports 503 so the website can show a
	// "temporarily unavailable" state rather than an empty roadmap.
	router, _ := New()
	rec, _ := get(t, router, "/roadmap")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}
