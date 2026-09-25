package server

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"testing"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/service"
)

// testInternalToken is the app<->API secret the test server is built with.
const testInternalToken = "internal-token"

// testServer is the REAL API (server.New, every register*API call, the real
// auth middleware and handlers) over a fake store, plus the complete list of
// operations it registered - including the Hidden QUERY twins that never reach
// the OpenAPI spec.
type testServer struct {
	handler  http.Handler
	ops      []huma.Operation
	registry *ai.Registry
	store    fakeStore
}

// newTestServer builds the API exactly the way cmd/flagon-server does, minus
// the database: the store is a fake and the audit reader always errors.
func newTestServer(t *testing.T, store fakeStore, extra ...Option) testServer {
	t.Helper()
	registry := ai.NewRegistry(service.New(store), testDocsIndex())
	var ops []huma.Operation
	opts := append([]Option{
		WithIdentity(store, testInternalToken),
		WithAudit(audit.NewStore(errQuerier{})),
		WithMCP(registry),
		func(o *Options) { o.onOperation = func(op huma.Operation) { ops = append(ops, op) } },
	}, extra...)
	router, _ := New(opts...)
	return testServer{handler: router, ops: ops, registry: registry, store: store}
}

// op returns the registered operation with the given id.
func (s testServer) op(t *testing.T, id string) huma.Operation {
	t.Helper()
	for _, op := range s.ops {
		if op.OperationID == id {
			return op
		}
	}
	t.Fatalf("operation %q is not registered", id)
	return huma.Operation{}
}

var pathParam = regexp.MustCompile(`\{[^}]+\}`)

// concretePath fills every {param} with a placeholder so the route matches.
func concretePath(path string) string {
	return pathParam.ReplaceAllString(path, "x")
}

// call issues one request against the test server. bearer is the full
// Authorization value ("" for none); internal requests also carry the forwarded
// user header the app would send.
func (s testServer) call(method, path, bearer string, body string) *httptest.ResponseRecorder {
	if body == "" {
		body = "{}"
	}
	req := httptest.NewRequestWithContext(context.Background(), method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if bearer == testInternalToken {
		req.Header.Set("X-Flagon-User-Id", "u1")
		req.Header.Set("X-Flagon-User-Email", "u@example.com")
	}
	rec := httptest.NewRecorder()
	s.handler.ServeHTTP(rec, req)
	return rec
}

// authRejected reports whether a status came from the auth/scope layer.
func authRejected(code int) bool {
	return code == http.StatusUnauthorized || code == http.StatusForbidden
}
