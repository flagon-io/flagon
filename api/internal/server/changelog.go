package server

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/flagon-io/flagon/api/internal/changelog"
)

// registerChangelogAPI wires the public changelog endpoint. Like the docs and
// roadmap endpoints, this serves content *about* Flagon - not operations on
// Flagon resources - so it is registered directly on the chi router and kept OUT
// of the OpenAPI spec. The product's API contract stays purely operational.
//
// It is unauthenticated (the changelog is public). The website renders its
// /changelog page entirely from this, so it holds no copy and cannot drift. A nil
// log reports 503, which the website treats as "temporarily unavailable" rather
// than an empty changelog.
func registerChangelogAPI(router chi.Router, log *changelog.Log) {
	// GET /changelog - every entry, newest first, with its Markdown body. The
	// changelog is small, so one request returns the whole thing.
	router.Get("/changelog", func(w http.ResponseWriter, r *http.Request) {
		if log == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "the changelog is not available"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"entries": log.Entries()})
	})
}
