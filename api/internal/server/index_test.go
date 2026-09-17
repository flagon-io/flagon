package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
		"docs_url":         "https://api.flagon.io/docs",
		"openapi_url":      "https://api.flagon.io/openapi.json",
		"openapi_yaml_url": "https://api.flagon.io/openapi.yaml",
	}
	for key, url := range want {
		if index[key] != url {
			t.Errorf("index[%q] = %q, want %q", key, index[key], url)
		}
	}
}

func TestIndexReflectsRegisteredOperations(t *testing.T) {
	router, api := New()

	huma.Register(api, huma.Operation{
		OperationID: "list-projects",
		Method:      http.MethodGet,
		Path:        "/projects",
	}, func(context.Context, *struct{}) (*struct{}, error) {
		return &struct{}{}, nil
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Host = "api.flagon.io"
	req.Header.Set("X-Forwarded-Proto", "https")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	index := decodeIndex(t, rec)
	if got, want := index["list_projects_url"], "https://api.flagon.io/projects"; got != want {
		t.Errorf("index[list_projects_url] = %q, want %q", got, want)
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
