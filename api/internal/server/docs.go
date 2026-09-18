package server

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/flagon-io/flagon/api/internal/docs"
)

// registerDocsAPI wires the public documentation content endpoints. These serve
// documentation *about* Flagon - not operations on Flagon resources - so they are
// registered directly on the chi router and kept OUT of the OpenAPI spec, exactly
// like the health checks, the index, and the MCP endpoint. The product's API
// contract stays purely operational; docs delivery is a separate concern.
//
// They are unauthenticated (documentation is public) and serve only
// public-visibility docs; internal docs never appear here. The website renders
// its /docs section entirely from these, so it holds no copy of the corpus and
// cannot drift. A nil index reports 503.
func registerDocsAPI(router chi.Router, index *docs.Index) {
	// GET /docs - list public documentation pages.
	router.Get("/docs", func(w http.ResponseWriter, r *http.Request) {
		if index == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "documentation is not available"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"docs": index.List(false)})
	})

	// GET /docs/search?q=&limit= - rank public docs against a query.
	router.Get("/docs/search", func(w http.ResponseWriter, r *http.Request) {
		if index == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "documentation is not available"})
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "q is required"})
			return
		}
		limit := 5
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 {
			limit = v
		}
		writeJSON(w, http.StatusOK, map[string]any{"results": index.Search(q, false, limit)})
	})

	// GET /docs/page?slug= - read one public page. The slug is a query parameter
	// because slugs contain slashes (platform/projects) at arbitrary depth.
	router.Get("/docs/page", func(w http.ResponseWriter, r *http.Request) {
		if index == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "documentation is not available"})
			return
		}
		slug := strings.Trim(strings.TrimSpace(r.URL.Query().Get("slug")), "/")
		if slug == "" {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "slug is required"})
			return
		}
		doc, ok := index.Get(slug, false)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such doc"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"doc": doc})
	})
}
