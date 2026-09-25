package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
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
	h.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, path, nil))
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

func TestDocsNav(t *testing.T) {
	idx := docs.NewIndex(docs.Corpus{
		Docs: []docs.Doc{
			{Slug: "index", Title: "Welcome", Visibility: docs.Public},
			{Slug: "platform/projects", Title: "Projects", Section: "Features", Visibility: docs.Public},
			{Slug: "handbook/pay", Title: "Compensation", Section: "handbook", Visibility: docs.Internal},
		},
		Nav: &docs.Nav{
			Index: &docs.NavItem{Type: docs.NavPage, Slug: "index", Title: "Welcome"},
			Groups: []docs.NavGroup{{
				Title: "Build and operate",
				Sections: []docs.NavSection{{
					Folder: "platform",
					Title:  "Features",
					Items: []docs.NavItem{
						{Type: docs.NavSeparator, Title: "Resources"},
						{Type: docs.NavPage, Slug: "platform/projects", Title: "Projects"},
					},
				}},
			}},
		},
	})
	router, _ := New(WithDocs(idx))

	rec, body := get(t, router, "/docs/nav")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET /docs/nav = %d", rec.Code)
	}
	nav, _ := body["nav"].(map[string]any)
	if index, _ := nav["index"].(map[string]any); index["slug"] != "index" {
		t.Fatalf("expected the landing page in nav.index, got %v", nav["index"])
	}
	groups, _ := nav["groups"].([]any)
	if len(groups) != 1 {
		t.Fatalf("expected 1 group, got %d", len(groups))
	}
	g := groups[0].(map[string]any)
	sections := g["sections"].([]any)
	items := sections[0].(map[string]any)["items"].([]any)
	if first := items[0].(map[string]any); first["type"] != "separator" || first["title"] != "Resources" {
		t.Fatalf("expected a separator first, got %v", first)
	}
	if strings.Contains(rec.Body.String(), "handbook") {
		t.Fatal("internal handbook pages must not appear in the public nav")
	}

	// The list follows nav order: the landing page first.
	_, body = get(t, router, "/docs")
	list, _ := body["docs"].([]any)
	if first := list[0].(map[string]any); first["slug"] != "index" {
		t.Fatalf("expected /docs to list the landing page first, got %v", first["slug"])
	}

	// No corpus wired: 503, like the other docs routes.
	bare, _ := New()
	if rec, _ := get(t, bare, "/docs/nav"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("GET /docs/nav without a corpus = %d, want 503", rec.Code)
	}
}

func TestDocsNav_EmptyCorpusHasGroupsArray(t *testing.T) {
	router, _ := New(WithDocs(testDocsIndex()))
	rec, _ := get(t, router, "/docs/nav")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"groups":[]`) {
		t.Fatalf("GET /docs/nav on a nav-less corpus = %d %s; want 200 with an empty groups array", rec.Code, rec.Body.String())
	}
}
