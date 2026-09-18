package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
)

func TestIndexServesDiscoveryLinks(t *testing.T) {
	router, _ := New()

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "api.flagon.io"
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("root status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}

	index := decodeIndex(t, rec)
	want := map[string]string{
		"openapi_url":      "https://api.flagon.io/openapi.json",
		"openapi_yaml_url": "https://api.flagon.io/openapi.yaml",
	}
	for key, url := range want {
		if index[key] != url {
			t.Errorf("index[%q] = %q, want %q", key, index[key], url)
		}
	}
	if _, ok := index["docs_url"]; ok {
		t.Errorf("index should not advertise a docs_url (no built-in docs UI)")
	}
}

// The built-in interactive API explorer stays disabled (config.DocsPath = "").
// The /docs path is now the documentation API, which serves JSON, never the
// Swagger/Stoplight HTML UI. The website renders its own docs from that API.
func TestNoInteractiveDocsUI(t *testing.T) {
	router, _ := New()

	// The OpenAPI spec must always be served.
	for _, path := range []string{"/openapi.json", "/openapi.yaml"} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusOK {
			t.Errorf("GET %s = %d, want 200 (spec must stay served)", path, rec.Code)
		}
	}

	// /docs must not be an HTML docs UI. With no corpus wired it reports 503,
	// but either way the body is JSON, never a Swagger/Stoplight HTML page.
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/docs", nil))
	body := rec.Body.String()
	if strings.Contains(strings.ToLower(body), "<!doctype") || strings.Contains(strings.ToLower(body), "swagger") {
		t.Errorf("GET /docs looks like an HTML docs UI, want JSON API: %s", body)
	}
}

func TestIndexReflectsRegisteredOperations(t *testing.T) {
	router, api := New()

	huma.Register(api, huma.Operation{
		OperationID: "list-widgets",
		Method:      http.MethodGet,
		Path:        "/widgets",
	}, func(context.Context, *struct{}) (*struct{}, error) {
		return &struct{}{}, nil
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "api.flagon.io"
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	index := decodeIndex(t, rec)
	if got, want := index["list_widgets_url"], "https://api.flagon.io/widgets"; got != want {
		t.Errorf("index[list_widgets_url] = %q, want %q", got, want)
	}
}

func TestBaseURLFallsBackToHTTPWithoutTLS(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "localhost:8080"
	if got, want := baseURL(req), "http://localhost:8080"; got != want {
		t.Errorf("baseURL = %q, want %q", got, want)
	}
}

func decodeIndex(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	var index map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &index); err != nil {
		t.Fatalf("decode index: %v (body: %s)", err, rec.Body.String())
	}
	return index
}
