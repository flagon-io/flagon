package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestHandlerServesRuntimeMetrics(t *testing.T) {
	m := New(nil) // nil pool (degraded) must not panic; pool metrics just absent

	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("metrics status = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "go_goroutines") {
		t.Error("expected go runtime metrics in output")
	}
}

func TestInstrumentHTTPRecordsRoutePattern(t *testing.T) {
	m := New(nil)

	router := chi.NewRouter()
	router.Get("/things/{id}", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	handler := m.InstrumentHTTP(router)

	// Two different ids must collapse to one route label, not two.
	for _, id := range []string{"1", "2"} {
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/things/"+id, nil))
	}

	scrape := httptest.NewRecorder()
	m.Handler().ServeHTTP(scrape, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := scrape.Body.String()

	want := `flagon_http_request_duration_seconds_count{method="GET",route="/things/{id}",status="200"} 2`
	if !strings.Contains(body, want) {
		t.Errorf("expected bounded route label with count 2; got:\n%s", body)
	}
}
