// Package paginate is Flagon's reusable list-query convention: free-text search
// plus keyset (cursor) pagination, surfaced to clients through RFC 5988 Link
// headers. One import gives an endpoint the whole pattern - a Query in, a trimmed
// slice plus an opaque next-cursor out, and a Link header built from them.
//
// The design is deliberately transport-agnostic. Today a Query is bound from the
// query string of a GET. The HTTP QUERY method (RFC 9110's safe, idempotent query
// method) carries its parameters in a request body instead; because Query is a
// plain struct and the Cursor is an opaque, self-contained token, moving to QUERY
// later is a change in the binding layer only - the domain signatures, the cursor,
// and the response shape do not change. The Cursor is the atomic unit that
// survives that switch: whether it arrives in a URL (Link header) or a QUERY body,
// it means the same thing.
package paginate

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

// DefaultLimit and MaxLimit bound every list's page size, so no caller can ask for
// an unbounded scan.
const (
	DefaultLimit = 30
	MaxLimit     = 100
)

// ErrBadCursor is returned by DecodeCursor for a malformed token. Handlers map it
// to 422 (the cursor is client-supplied input).
var ErrBadCursor = errors.New("invalid pagination cursor")

// Query is one list request: a free-text search and a keyset page position. Zero
// values mean "no search, first page, default size". It is transport-agnostic (see
// the package doc): the same shape binds from a query string now and from a QUERY
// request body later.
type Query struct {
	Q      string // free-text search; "" means no filter
	Limit  int    // requested page size; clamped by Clamp
	Cursor string // opaque keyset cursor from a prior page's Link header; "" is the first page
}

// Clamp returns the effective page size, within [1, MaxLimit], defaulting when the
// caller left Limit unset and capping (never resetting) a limit above MaxLimit.
func (q Query) Clamp() int { return ClampLimit(q.Limit) }

// ClampLimit is Clamp for a bare page size: <= 0 is DefaultLimit, above MaxLimit
// is MaxLimit. Every list (paginated or a plain "most recent N") uses it, so a
// large limit means "as many as allowed" everywhere.
func ClampLimit(n int) int {
	if n <= 0 {
		return DefaultLimit
	}
	if n > MaxLimit {
		return MaxLimit
	}
	return n
}

// Keys decodes the cursor into the ordered sort-key values of the last row on the
// previous page (nil on the first page). These feed the query's keyset predicate,
// in the same column order as its ORDER BY.
func (q Query) Keys() ([]string, error) {
	return DecodeCursor(q.Cursor)
}

// EncodeCursor packs a row's ordered sort-key values into an opaque, URL-safe
// token. The values must be the ORDER BY columns of the query, in order, so the
// next page can resume exactly after this row.
func EncodeCursor(keys ...string) string {
	b, _ := json.Marshal(keys)
	return base64.RawURLEncoding.EncodeToString(b)
}

// DecodeCursor parses a token from EncodeCursor. An empty token yields (nil, nil):
// the first page. A malformed token yields ErrBadCursor.
func DecodeCursor(token string) ([]string, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return nil, ErrBadCursor
	}
	var keys []string
	if err := json.Unmarshal(raw, &keys); err != nil {
		return nil, ErrBadCursor
	}
	return keys, nil
}

// Slice trims rows fetched with LIMIT Clamp()+1 down to a single page and computes
// the next cursor from the last kept row. keyOf returns a row's ordered sort-key
// values (the query's ORDER BY columns). next is "" when this is the last page.
//
// The one-extra-row probe is how we know another page exists without a COUNT:
// keyset pagination has no total, by design (it stays O(1) at any depth).
//
// Prefer SliceKeyed: keyOf re-derives the sort key in Go, which must match the
// query's ORDER BY exactly - a hazard for case-folded keys (Go's strings.ToLower
// vs Postgres lower() can differ for some characters). SliceKeyed takes the key the
// database itself produced, so the cursor can never disagree with the query.
func Slice[T any](rows []T, limit int, keyOf func(T) []string) (items []T, next string) {
	if limit > 0 && len(rows) > limit {
		last := rows[limit-1]
		return rows[:limit], EncodeCursor(keyOf(last)...)
	}
	return rows, ""
}

// SliceKeyed trims rows fetched with LIMIT limit+1 to a single page and builds the
// next cursor from the DATABASE-computed sort key of the last kept row. keys[i] holds
// the ordered ORDER BY values for rows[i] exactly as the query produced them (select
// the ORDER BY tuple as a text[] and scan it), so the cursor is always consistent
// with the query's own keyset comparison - the sort key is never re-derived in Go.
// keys must be parallel to rows (same length and order). next is "" on the last page.
func SliceKeyed[T any](rows []T, keys [][]string, limit int) (items []T, next string) {
	if limit > 0 && len(rows) > limit {
		return rows[:limit], EncodeCursor(keys[limit-1]...)
	}
	return rows, ""
}

// LinkHeader renders an RFC 5988 Link header advertising the next page, or "" when
// there is none (next == ""). path is the request path without a query string; the
// current search and page size are carried forward so the next link is a complete,
// replayable request. This is the GET-era transport of the cursor; under the QUERY
// method the same next cursor would instead be returned for the client to place in
// its next request body.
func LinkHeader(path string, q Query, next string) string {
	if next == "" {
		return ""
	}
	v := url.Values{}
	if q.Q != "" {
		v.Set("q", q.Q)
	}
	if q.Limit > 0 {
		v.Set("limit", strconv.Itoa(q.Clamp()))
	}
	v.Set("cursor", next)
	return "<" + path + "?" + v.Encode() + ">; rel=\"next\""
}
