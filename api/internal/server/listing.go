package server

import (
	"context"
	"errors"

	"github.com/danielgtaylor/huma/v2"

	"github.com/flagon-io/flagon/api/internal/paginate"
)

// cursorHTTPErr maps a bad pagination cursor to 422 Unprocessable Entity. The
// cursor is client-supplied input (it rides the query string / request body), so
// a malformed or wrong-arity cursor is a client error, not a server fault. Every
// list error mapper calls this first and falls through to its own mapping when it
// returns nil, keeping the 422 contract (see paginate.ErrBadCursor) in one place.
func cursorHTTPErr(err error) error {
	if errors.Is(err, paginate.ErrBadCursor) {
		return huma.Error422UnprocessableEntity("invalid pagination cursor")
	}
	return nil
}

// This file holds the reusable server-side half of the list convention (the core
// lives in internal/paginate): the standard search + keyset params, in both their
// GET (query string) and QUERY (request body) forms, plus a helper to register the
// QUERY twin of a list endpoint.
//
// Every paginated list is exposed two ways from ONE handler:
//   - a documented GET, whose params ride the query string (what the UI uses); and
//   - a Hidden QUERY (the HTTP QUERY method), whose params ride a JSON body, for
//     API clients that want a body-based query.
// Both go through the same auth + scope middleware and call the same store method.
//
// To add pagination to a new list endpoint:
//  1. Give the domain method a paginate.Query and have it return (items, next, err)
//     using paginate.Slice for the cursor (see db.ListProjects).
//  2. Define a `<name>Path` struct with the path params, a GET input embedding it
//     plus ListParams, and a QUERY input embedding it plus `Body ListBody`.
//  3. Register the GET with huma.Register, and the QUERY with registerQueryList,
//     both delegating to one shared closure. Set out.Link with paginate.LinkHeader.
//  4. Map BOTH operation IDs ("list-x" and "query-x") to the scope in scopes.go.

// ListParams is embedded in a GET list input to add the standard search + keyset
// query params. It is deliberately the same shape as ListBody so the GET and QUERY
// forms of an endpoint are interchangeable.
type ListParams struct {
	Q      string `query:"q" doc:"Free-text search filter"`
	Limit  int    `query:"limit" doc:"Max results per page (1-100, default 30)"`
	Cursor string `query:"cursor" doc:"Opaque keyset cursor from a prior page's Link header (rel=next)"`
}

// ListQuery converts the bound params into a transport-agnostic paginate.Query.
func (p ListParams) ListQuery() paginate.Query {
	return paginate.Query{Q: p.Q, Limit: p.Limit, Cursor: p.Cursor}
}

// ListBody is the JSON body of a QUERY list request: the same three params as
// ListParams, carried in the body per the HTTP QUERY method.
type ListBody struct {
	Q      string `json:"q,omitempty" doc:"Free-text search filter"`
	Limit  int    `json:"limit,omitempty" doc:"Max results per page (1-100, default 30)"`
	Cursor string `json:"cursor,omitempty" doc:"Opaque keyset cursor from a prior page's Link header (rel=next)"`
}

// ListQuery converts the body params into a transport-agnostic paginate.Query.
func (b ListBody) ListQuery() paginate.Query {
	return paginate.Query{Q: b.Q, Limit: b.Limit, Cursor: b.Cursor}
}

// registerQueryList registers the Hidden HTTP QUERY twin of a GET list endpoint.
// It shares the GET's auth middleware and handler; only the input binding differs
// (a JSON body instead of query params). It is Hidden because OpenAPI 3.1 has no
// path-item field for QUERY, so it stays out of the generated spec while remaining
// fully routed and validated. The opID must be distinct from the GET's and mapped
// to the same scope in scopes.go.
func registerQueryList[I, O any](
	api huma.API,
	auth func(huma.Context, func(huma.Context)),
	opID, path, summary string,
	handler func(context.Context, *I) (*O, error),
) {
	huma.Register(api, huma.Operation{
		OperationID: opID,
		Method:      "QUERY",
		Path:        path,
		Summary:     summary,
		Hidden:      true,
		Middlewares: huma.Middlewares{auth},
	}, handler)
}
