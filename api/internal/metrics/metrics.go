// Package metrics exposes Prometheus metrics for the API: pgx connection-pool
// stats, HTTP request latency, and the standard Go runtime/process metrics.
// They are served on a private port that Fly's managed Prometheus scrapes (see
// the [metrics] block in fly.toml), so they are never exposed on the public
// service.
package metrics

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics owns the registry and the HTTP request histogram.
type Metrics struct {
	registry     *prometheus.Registry
	httpDuration *prometheus.HistogramVec
}

// New builds a registry with Go runtime, process, and pgx-pool collectors, plus
// an HTTP request-duration histogram. pool may be nil (degraded mode) - the pool
// collector simply emits nothing until a database is configured.
func New(pool *pgxpool.Pool) *Metrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
		newPgxCollector(pool),
	)

	httpDuration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "flagon_http_request_duration_seconds",
		Help:    "HTTP request latency by method, route, and status.",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "route", "status"})
	reg.MustRegister(httpDuration)

	return &Metrics{registry: reg, httpDuration: httpDuration}
}

// Handler serves the metrics in Prometheus text format.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

// InstrumentHTTP wraps a handler to record request latency. It seeds a chi
// RouteContext so the matched route pattern (e.g. "/projects/{id}", not the raw
// path) is available for the label after routing, keeping label cardinality
// bounded no matter what paths clients hit.
func (m *Metrics) InstrumentHTTP(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rctx := chi.NewRouteContext()
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		next.ServeHTTP(rec, r)

		route := rctx.RoutePattern()
		if route == "" {
			route = "unmatched"
		}
		m.httpDuration.WithLabelValues(r.Method, route, strconv.Itoa(rec.status)).
			Observe(time.Since(start).Seconds())
	})
}

// statusRecorder captures the response status code for the metrics label.
type statusRecorder struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (r *statusRecorder) WriteHeader(code int) {
	if !r.wrote {
		r.status = code
		r.wrote = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	r.wrote = true
	return r.ResponseWriter.Write(b)
}
