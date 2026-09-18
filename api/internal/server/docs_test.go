package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/flagon-io/flagon/api/internal/docs"
)

// testDocsIndex builds a small, controlled corpus (one public, one internal doc)
// so the HTTP/MCP integration tests are deterministic and independent of whatever
// real documentation happens to be in the embedded corpus. Visibility scoring
// itself is unit-tested against the corpus in the docs package.
func testDocsIndex() *docs.Index {
	return docs.NewIndex(docs.Corpus{Docs: []docs.Doc{
		{Slug: "platform/projects", Title: "Projects", Description: "The core deployable unit.", Section: "platform", Visibility: docs.Public, Body: "A project is deployable."},
		{Slug: "handbook/pay", Title: "Compensation", Section: "handbook", Visibility: docs.Internal, Body: "How we think about salary and pay bands."},
	}})
}

// testDocsRouter wires a server with the controlled corpus.
func testDocsRouter(t *testing.T) http.Handler {
	t.Helper()
	router, _ := New(WithDocs(testDocsIndex()))
	return router
}

func get(t *testing.T, h http.Handler, path string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	var body map[string]any
	if rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), &body)
	}
	return rec, body
}

func TestListDocs_PublicOnly(t *testing.T) {
	h := testDocsRouter(t)
	rec, body := get(t, h, "/docs")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /docs = %d", rec.Code)
	}
	list, _ := body["docs"].([]any)
	if len(list) == 0 {
		t.Fatal("expected some public docs")
	}
	for _, d := range list {
		m := d.(map[string]any)
		if m["visibility"] == string(docs.Internal) {
			t.Fatalf("internal doc leaked into public list: %v", m["slug"])
		}
		if m["slug"] == "handbook/pay" {
			t.Fatal("internal handbook doc must not appear in the public list")
		}
	}
}

func TestGetDoc_PublicAndInternal(t *testing.T) {
	h := testDocsRouter(t)

	rec, body := get(t, h, "/docs/page?slug=platform/projects")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET public doc = %d", rec.Code)
	}
	doc, _ := body["doc"].(map[string]any)
	if doc["title"] != "Projects" {
		t.Fatalf("unexpected doc: %v", doc["title"])
	}

	// Internal docs must 404 on the public endpoint.
	rec, _ = get(t, h, "/docs/page?slug=handbook/pay")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("internal doc via public endpoint should 404, got %d", rec.Code)
	}
}

func TestSearchDocs(t *testing.T) {
	h := testDocsRouter(t)
	rec, body := get(t, h, "/docs/search?q=projects")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /docs/search = %d", rec.Code)
	}
	results, _ := body["results"].([]any)
	if len(results) == 0 {
		t.Fatal("expected search hits for 'projects'")
	}
	// A search that only matches an internal doc returns nothing publicly.
	_, body = get(t, h, "/docs/search?q=salary")
	if results, _ := body["results"].([]any); len(results) != 0 {
		t.Fatalf("public search must not surface internal docs, got %d", len(results))
	}
	// Missing query is a client error.
	rec, _ = get(t, h, "/docs/search")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("empty query should be 422, got %d", rec.Code)
	}
}
