package db

import "github.com/flagon-io/flagon/api/internal/paginate"

// cursorArg turns a list query's opaque cursor into the text[] argument passed to
// the SECURITY DEFINER list functions (and validates its arity). It returns nil -
// which pgx encodes as SQL NULL, the "first page" sentinel the functions expect -
// when there is no cursor, and ErrBadCursor when the cursor does not carry exactly
// n keys (e.g. a cursor minted for a different list). Callers pair it with
// paginate.Slice, whose keyOf must produce the same n keys in the same order as the
// function's ORDER BY.
func cursorArg(q paginate.Query, n int) (any, error) {
	keys, err := q.Keys()
	if err != nil {
		return nil, err
	}
	if len(keys) == 0 {
		return nil, nil
	}
	if len(keys) != n {
		return nil, paginate.ErrBadCursor
	}
	return keys, nil
}
