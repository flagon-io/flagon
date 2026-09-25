package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/flagon-io/flagon/api/internal/ai"
	"github.com/flagon-io/flagon/api/internal/audit"
	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/service"
)

// --- 1. error redaction + request ids -------------------------------------------

func TestServerErrorsNeverLeakInternalDetail(t *testing.T) {
	store := newFakeStore(nil)
	store.err = errors.New("dial tcp secret-db.internal:5432: password authentication failed for user flagon")
	s := newTestServer(t, store)

	rec := s.call(http.MethodGet, "/orgs", testInternalToken, "")
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 (body: %s)", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if strings.Contains(body, "secret-db") || strings.Contains(body, "password") {
		t.Fatalf("500 body leaked the internal error: %s", body)
	}
	var problem map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
		t.Fatalf("problem body: %v", err)
	}
	if _, has := problem["errors"]; has {
		t.Fatalf("500 body still carries an errors list: %s", body)
	}
	if problem["detail"] != "could not list orgs" {
		t.Fatalf("detail = %v, want the caller-safe fallback", problem["detail"])
	}
	if id := rec.Header().Get(RequestIDHeader); len(id) < 8 {
		t.Fatalf("missing %s header on an error response", RequestIDHeader)
	}
}

func TestClientErrorsKeepTheirDetail(t *testing.T) {
	// Redaction is for 5xx only: a validation failure still explains itself.
	s := newTestServer(t, newFakeStore(nil))
	rec := s.call(http.MethodPost, "/orgs", testInternalToken, `{"name": 5}`)
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), `"errors"`) {
		t.Fatalf("422 should keep its errors list: %d %s", rec.Code, rec.Body.String())
	}
}

func TestRequestIDIsGeneratedOrPropagated(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))

	req := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	s.handler.ServeHTTP(rec, req)
	first := rec.Header().Get(RequestIDHeader)
	if len(first) != 32 {
		t.Fatalf("generated request id = %q, want 32 hex chars", first)
	}

	req = httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	req.Header.Set(RequestIDHeader, "gateway-req-123")
	rec = httptest.NewRecorder()
	s.handler.ServeHTTP(rec, req)
	if got := rec.Header().Get(RequestIDHeader); got != "gateway-req-123" {
		t.Fatalf("well-formed id not propagated: %q", got)
	}

	req = httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/healthz", nil)
	req.Header.Set(RequestIDHeader, "bad id\r\nX-Injected: 1")
	rec = httptest.NewRecorder()
	s.handler.ServeHTTP(rec, req)
	if got := rec.Header().Get(RequestIDHeader); strings.ContainsAny(got, " \r\n:") || len(got) != 32 {
		t.Fatalf("malformed id must be replaced, got %q", got)
	}
}

func TestReadyzDoesNotLeakTheDatabaseError(t *testing.T) {
	router, _ := New(WithReadyCheck(func(context.Context) error {
		return errors.New("dial tcp 10.0.0.7:5432: connect: connection refused")
	}))
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/readyz", nil))
	if rec.Code != http.StatusServiceUnavailable || strings.Contains(rec.Body.String(), "10.0.0.7") {
		t.Fatalf("readyz = %d %s", rec.Code, rec.Body.String())
	}
}

// --- 2. audit "where" ------------------------------------------------------------

type where struct{ ip, country, ua string }

// whereStore records the audit "where" in context whenever an org is created,
// through any front door.
type whereStore struct {
	fakeStore
	mu  *sync.Mutex
	got *[]where
}

func newWhereStore() whereStore {
	return whereStore{fakeStore: newFakeStore(nil), mu: &sync.Mutex{}, got: &[]where{}}
}

func (w whereStore) CreateOrg(ctx context.Context, userID, email, name, slug string) (db.Org, error) {
	ip, _ := ctx.Value(audit.CtxIP).(string)
	country, _ := ctx.Value(audit.CtxCountry).(string)
	ua, _ := ctx.Value(audit.CtxUA).(string)
	w.mu.Lock()
	*w.got = append(*w.got, where{ip, country, ua})
	w.mu.Unlock()
	return w.fakeStore.CreateOrg(ctx, userID, email, name, slug)
}

func (w whereStore) last(t *testing.T) where {
	t.Helper()
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(*w.got) == 0 {
		t.Fatal("no audited mutation reached the store")
	}
	return (*w.got)[len(*w.got)-1]
}

func newWhereServer(t *testing.T, limits Limits) (http.Handler, whereStore) {
	t.Helper()
	ws := newWhereStore()
	registry := ai.NewRegistry(service.New(ws), nil)
	agent := ai.NewAgent(ai.NewMock(""), registry, &fakeMeter{})
	router, _ := New(WithIdentity(ws, testInternalToken), WithMCP(registry), WithAI(agent), WithLimits(limits))
	return router, ws
}

// spoofHeaders are what a malicious token holder would send to forge their
// audit location.
func spoofHeaders(req *http.Request) {
	req.Header.Set("X-Flagon-Client-Ip", "6.6.6.6")
	req.Header.Set("X-Flagon-Client-Country", "ZZ")
	req.Header.Set("X-Flagon-Client-Ua", "forged-ua")
	req.Header.Set("X-Forwarded-For", "7.7.7.7")
	req.Header.Set("Fly-Client-Ip", "8.8.8.8")
	req.Header.Set("User-Agent", "real-cli/1.0")
}

func doReq(h http.Handler, method, path, bearer, body string, mutate func(*http.Request)) *httptest.ResponseRecorder {
	req := httptest.NewRequestWithContext(context.Background(), method, path, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	if bearer == testInternalToken {
		req.Header.Set("X-Flagon-User-Id", "u1")
		req.Header.Set("X-Flagon-User-Email", "u@example.com")
	}
	if mutate != nil {
		mutate(req)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestAuditWhere_TokenCallersCannotSpoofTheirIP(t *testing.T) {
	h, ws := newWhereServer(t, Limits{})
	rec := doReq(h, http.MethodPost, "/orgs", "flagon_pat", `{"name":"Acme"}`, spoofHeaders)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create-org = %d %s", rec.Code, rec.Body.String())
	}
	// httptest's peer address is 192.0.2.1; no proxy header is trusted by default.
	if got := ws.last(t); got != (where{"192.0.2.1", "", "real-cli/1.0"}) {
		t.Fatalf("token caller where = %+v, want the connection's own address", got)
	}
}

func TestAuditWhere_ConfiguredProxyHeaderIsHonored(t *testing.T) {
	h, ws := newWhereServer(t, Limits{ClientIPHeader: "Fly-Client-IP"})
	rec := doReq(h, http.MethodPost, "/orgs", "flagon_pat", `{"name":"Acme"}`, spoofHeaders)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create-org = %d", rec.Code)
	}
	if got := ws.last(t).ip; got != "8.8.8.8" {
		t.Fatalf("ip = %q, want the configured proxy header's value", got)
	}
}

func TestAuditWhere_GatewayForwardsTheEndUser(t *testing.T) {
	h, ws := newWhereServer(t, Limits{})
	rec := doReq(h, http.MethodPost, "/orgs", testInternalToken, `{"name":"Acme"}`, spoofHeaders)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create-org = %d", rec.Code)
	}
	if got := ws.last(t); got != (where{"6.6.6.6", "ZZ", "forged-ua"}) {
		t.Fatalf("gateway where = %+v, want the forwarded end-user values", got)
	}
}

func TestAuditWhere_AssistantActionsRecordTheClient(t *testing.T) {
	h, ws := newWhereServer(t, Limits{})
	body := aiExecuteBody(testOrgID, "create_organization", map[string]any{"name": "Globex"})
	rec := doReq(h, http.MethodPost, "/ai/actions/execute", testInternalToken, body, spoofHeaders)
	if rec.Code != http.StatusOK {
		t.Fatalf("ai-execute-action = %d %s", rec.Code, rec.Body.String())
	}
	if got := ws.last(t); got != (where{"6.6.6.6", "ZZ", "forged-ua"}) {
		t.Fatalf("assistant action where = %+v, want the forwarded client", got)
	}
}

func TestAuditWhere_MCPToolCallsRecordTheClient(t *testing.T) {
	h, ws := newWhereServer(t, Limits{})
	payload := `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"create_organization","arguments":{"name":"Acme"}}}`
	rec := doReq(h, http.MethodPost, "/mcp", "flagon_pat", payload, spoofHeaders)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), `"isError":true`) {
		t.Fatalf("mcp create_organization = %d %s", rec.Code, rec.Body.String())
	}
	if got := ws.last(t); got != (where{"192.0.2.1", "", "real-cli/1.0"}) {
		t.Fatalf("mcp where = %+v, want the connection address + user agent", got)
	}
}

// --- 3. limits -----------------------------------------------------------------

func TestBodyLimit(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil), WithLimits(Limits{MaxBodyBytes: 1024}))
	big := `{"jsonrpc":"2.0","id":1,"method":"ping","params":{"pad":"` + strings.Repeat("x", 4096) + `"}}`

	// Declared length over the cap: refused before any handler.
	rec := doReq(s.handler, http.MethodPost, "/mcp", "", big, nil)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize MCP body = %d, want 413", rec.Code)
	}
	// Undeclared (chunked) length: the MCP decoder trips the cap.
	rec = doReq(s.handler, http.MethodPost, "/mcp", "", big, func(r *http.Request) { r.ContentLength = -1 })
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversize chunked MCP body = %d, want 413 (body %s)", rec.Code, rec.Body.String())
	}
	// A normal request is untouched.
	rec = doReq(s.handler, http.MethodPost, "/mcp", "", `{"jsonrpc":"2.0","id":1,"method":"ping"}`, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("small MCP body = %d", rec.Code)
	}
}

func TestRateLimit(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil), WithLimits(Limits{RateLimit: 0.001, RateBurst: 2}))

	for i := 0; i < 2; i++ {
		if rec := doReq(s.handler, http.MethodGet, "/me", "flagon_a", "", nil); rec.Code != http.StatusOK {
			t.Fatalf("request %d within burst = %d", i, rec.Code)
		}
	}
	rec := doReq(s.handler, http.MethodGet, "/me", "flagon_a", "", nil)
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("over burst = %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Fatal("429 without Retry-After")
	}
	var problem map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil || problem["status"] != float64(429) || problem["title"] != "Too Many Requests" {
		t.Fatalf("429 body is not a problem document: %s", rec.Body.String())
	}

	// Budgets are per principal: another token, a gateway user, and an
	// anonymous caller each have their own; the MCP endpoint is limited too.
	if rec := doReq(s.handler, http.MethodGet, "/me", "flagon_b", "", nil); rec.Code != http.StatusOK {
		t.Fatalf("second token = %d, want its own budget", rec.Code)
	}
	if rec := doReq(s.handler, http.MethodGet, "/me", testInternalToken, "", nil); rec.Code != http.StatusOK {
		t.Fatalf("gateway user = %d, want its own budget", rec.Code)
	}
	for i := 0; i < 2; i++ {
		doReq(s.handler, http.MethodPost, "/mcp", "", `{"jsonrpc":"2.0","id":1,"method":"ping"}`, nil)
	}
	if rec := doReq(s.handler, http.MethodPost, "/mcp", "", `{"jsonrpc":"2.0","id":1,"method":"ping"}`, nil); rec.Code != http.StatusTooManyRequests {
		t.Fatalf("anonymous MCP over burst = %d, want 429", rec.Code)
	}

	// Health checks are never limited.
	for i := 0; i < 5; i++ {
		if rec := doReq(s.handler, http.MethodGet, "/healthz", "", "", nil); rec.Code != http.StatusOK {
			t.Fatalf("healthz = %d", rec.Code)
		}
	}
}

func TestRateLimiterRefills(t *testing.T) {
	l := newRateLimiter(10, 1) // one token, refilling every 100ms
	now := testNow()
	if ok, _ := l.allow("k", now); !ok {
		t.Fatal("first request refused")
	}
	ok, wait := l.allow("k", now)
	if ok || wait <= 0 {
		t.Fatalf("empty bucket: ok=%v wait=%v", ok, wait)
	}
	if ok, _ := l.allow("k", now.Add(wait)); !ok {
		t.Fatal("request after Retry-After refused")
	}
	// Idle buckets are swept once they would be full again.
	l.allow("other", now.Add(sweepEvery*2))
	if _, kept := l.buckets["k"]; kept {
		t.Fatal("idle bucket not swept")
	}
}

// --- 5. assistant org confinement --------------------------------------------------

func TestAIExecute_ConfinedToTheConversationOrg(t *testing.T) {
	s := newAIServer(t, newFakeStore(nil), &fakeMeter{})
	rec := s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody(testOrgID, "delete_project", map[string]any{"org": "globex", "project": "web"}))
	if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "acme") {
		t.Fatalf("other-org action = %d %s, want 403 naming the conversation org", rec.Code, rec.Body.String())
	}
	rec = s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody(testOrgID, "restore_organization", map[string]any{"id": "22222222-2222-2222-2222-222222222222"}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("cross-org tool = %d, want 403", rec.Code)
	}
	rec = s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody(testOrgID, "delete_project", map[string]any{"org": "acme", "project": "web"}))
	if rec.Code != http.StatusOK {
		t.Fatalf("in-org action = %d %s", rec.Code, rec.Body.String())
	}
}

// quotaMeter is an org over its AI quota.
type quotaMeter struct{ fakeMeter }

func (*quotaMeter) Allowed(context.Context, string, string) (bool, error) { return false, nil }

func TestAIExecute_ChecksQuotaFirst(t *testing.T) {
	store := newFakeStore(nil)
	meter := &quotaMeter{}
	registry := ai.NewRegistry(service.New(store), nil)
	s := newTestServer(t, store, WithAI(ai.NewAgent(ai.NewMock(""), registry, meter)))
	rec := s.call(http.MethodPost, "/ai/actions/execute", testInternalToken,
		aiExecuteBody(testOrgID, "add_member", map[string]any{"org": "acme", "login": "sam@example.com"}))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("over-quota action = %d %s, want 429", rec.Code, rec.Body.String())
	}
	if n := store.notifications(); len(n) != 0 {
		t.Fatalf("an over-quota action ran (notifications %v)", n)
	}
	if len(meter.records) != 0 {
		t.Fatalf("an over-quota action was metered: %v", meter.records)
	}
}

func testNow() time.Time { return time.Unix(1_700_000_000, 0) }

// Only a genuinely unknown/expired/revoked token is a 401. Any other failure to
// resolve a token (a database outage) is a redacted 503, so a valid caller is
// never told to discard a good credential, and the cause stays server-side.
func TestCombinedAuth_ResolveFailureIsNotUnauthorized(t *testing.T) {
	for _, tc := range []struct {
		name string
		err  error
		want int
	}{
		{"unknown, expired or revoked token", db.ErrInvalidToken, http.StatusUnauthorized},
		{"wrapped invalid token", fmt.Errorf("resolve: %w", db.ErrInvalidToken), http.StatusUnauthorized},
		{"database unavailable", db.ErrUnavailable, http.StatusServiceUnavailable},
		{"database error", errors.New("dial tcp 10.9.8.7:5432: connection refused"), http.StatusServiceUnavailable},
	} {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore(nil)
			store.resolveErr = tc.err
			s := newTestServer(t, store)
			rec := s.call(http.MethodGet, "/me", "flagon_pat_x", "")
			if rec.Code != tc.want {
				t.Fatalf("GET /me = %d, want %d (body: %s)", rec.Code, tc.want, rec.Body.String())
			}
			if strings.Contains(rec.Body.String(), "10.9.8.7") || strings.Contains(rec.Body.String(), "connection refused") {
				t.Fatalf("the resolve error leaked to the client: %s", rec.Body.String())
			}
		})
	}
}
