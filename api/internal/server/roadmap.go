package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/flagon-io/flagon/api/internal/roadmap"
)

// registerRoadmapAPI wires the public roadmap endpoint. Like the docs endpoints,
// this serves content *about* Flagon - not operations on Flagon resources - so it
// is registered directly on the chi router and kept OUT of the OpenAPI spec. The
// product's API contract stays purely operational.
//
// It is unauthenticated (the roadmap is public). The website renders its /roadmap
// page entirely from this, so it holds no copy of the data and cannot drift. A
// nil board reports 503, which the website treats as "temporarily unavailable"
// rather than an empty roadmap.
func registerRoadmapAPI(router chi.Router, board *roadmap.Board) {
	// GET /roadmap - the whole board: items in stage order, the stage columns
	// (with labels and blurbs), and the distinct teams for the filter. One request
	// gives the website everything it needs to render the page.
	router.Get("/roadmap", func(w http.ResponseWriter, r *http.Request) {
		if board == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "the roadmap is not available"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"items":  board.Items(),
			"stages": board.Stages(),
			"teams":  board.Teams(),
		})
	})
}
