package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/service"
)

// apiErr renders any error from the service or store as an HTTP problem. A
// classified failure (see service.Classify - the single db.Err* -> status table)
// keeps its status and caller-safe message; anything else is an internal fault
// and becomes a 500 with the given fallback summary. This is the only error
// mapper in the HTTP layer, so every endpoint answers a given failure the same
// way the agent and MCP server describe it.
//
// The raw err rides along on the 500 only so redactServerErrors can LOG it with
// the request id; it is stripped before the response is written and never
// reaches the client.
func apiErr(err error, fallback string, overrides ...service.Override) error {
	if e, ok := service.Classify(err, overrides...); ok {
		return huma.NewError(e.Status, e.Message)
	}
	return huma.Error500InternalServerError(fallback, err)
}

// RequestIDHeader carries the per-request id on every response (and is honored
// on the request when a well-formed one is supplied, so the app gateway can
// propagate its own). Users quote it when reporting a failure; operators grep
// the server log for it.
const RequestIDHeader = "X-Request-Id"

type requestIDCtxKey struct{}

// RequestID returns the request id bound to ctx by the request-id middleware, or
// "" outside a request.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDCtxKey{}).(string)
	return id
}

// withRequestID assigns every request an id: a caller-supplied X-Request-Id when
// it is short and plain (so ids can be correlated across the gateway), or a fresh
// random one. The id is set on the response header before the handler runs, so
// even errors written by middleware carry it.
func withRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(RequestIDHeader)
		if !validRequestID(id) {
			id = newRequestID()
		}
		w.Header().Set(RequestIDHeader, id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), requestIDCtxKey{}, id)))
	})
}

// validRequestID accepts 8-128 characters of [A-Za-z0-9._-], so a forwarded id
// can never inject anything odd into a header or a log line.
func validRequestID(id string) bool {
	if len(id) < 8 || len(id) > 128 {
		return false
	}
	for _, c := range id {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9', c == '.', c == '_', c == '-':
		default:
			return false
		}
	}
	return true
}

func newRequestID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// redactServerErrors is a huma transformer that keeps internal failure detail
// server-side. Any 5xx problem response (a handler's Error500, an Error503, or
// huma's own wrapping of an unexpected error) has its `errors` list - which
// carries raw err.Error() text such as SQL, hostnames or provider responses -
// logged with the request id and then removed from the body. The problem's
// title, status and caller-safe detail are kept, and the response's
// X-Request-Id header lets a user report the failure.
func redactServerErrors(ctx huma.Context, _ string, v any) (any, error) {
	em, ok := v.(*huma.ErrorModel)
	if !ok || em.Status < http.StatusInternalServerError || len(em.Errors) == 0 {
		return v, nil
	}
	causes := make([]string, 0, len(em.Errors))
	for _, d := range em.Errors {
		if d != nil {
			causes = append(causes, d.Message)
		}
	}
	op := ""
	if o := ctx.Operation(); o != nil {
		op = o.OperationID
	}
	slog.ErrorContext(ctx.Context(), "internal error",
		"request_id", RequestID(ctx.Context()), "operation", op,
		"status", em.Status, "detail", em.Detail, "causes", causes)
	redacted := *em
	redacted.Errors = nil
	return &redacted, nil
}
