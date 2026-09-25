package paginate

import (
	"errors"
	"net/url"
	"strings"
	"testing"
)

func TestClamp(t *testing.T) {
	cases := []struct{ in, want int }{
		{0, DefaultLimit},
		{-5, DefaultLimit},
		{10, 10},
		{MaxLimit, MaxLimit},
		{MaxLimit + 1, MaxLimit},
		{1000, MaxLimit},
	}
	for _, c := range cases {
		if got := (Query{Limit: c.in}).Clamp(); got != c.want {
			t.Errorf("Clamp(%d) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestCursorRoundTrip(t *testing.T) {
	keys := []string{"acme widget", "id-123"}
	tok := EncodeCursor(keys...)
	if tok == "" {
		t.Fatal("encode produced empty token")
	}
	got, err := DecodeCursor(tok)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(got) != 2 || got[0] != keys[0] || got[1] != keys[1] {
		t.Fatalf("round trip = %v, want %v", got, keys)
	}
}

func TestDecodeCursorEmptyAndBad(t *testing.T) {
	got, err := DecodeCursor("")
	if err != nil || got != nil {
		t.Fatalf("empty cursor = (%v, %v), want (nil, nil)", got, err)
	}
	if _, err := DecodeCursor("!!!not base64!!!"); !errors.Is(err, ErrBadCursor) {
		t.Fatalf("bad cursor err = %v, want ErrBadCursor", err)
	}
	// Valid base64 that isn't a JSON string array is also rejected.
	if _, err := DecodeCursor("Zm9v"); !errors.Is(err, ErrBadCursor) { // base64("foo")
		t.Fatalf("non-array cursor err = %v, want ErrBadCursor", err)
	}
}

func TestSlice(t *testing.T) {
	key := func(s string) []string { return []string{s} }

	// Exactly limit rows: last page, no next.
	items, next := Slice([]string{"a", "b"}, 2, key)
	if len(items) != 2 || next != "" {
		t.Fatalf("full-but-not-over = (%v, %q), want 2 items, no next", items, next)
	}

	// limit+1 rows: trimmed to limit, next is the cursor of the last kept row.
	items, next = Slice([]string{"a", "b", "c"}, 2, key)
	if len(items) != 2 || items[1] != "b" {
		t.Fatalf("over-limit items = %v, want [a b]", items)
	}
	if got, _ := DecodeCursor(next); len(got) != 1 || got[0] != "b" {
		t.Fatalf("next cursor keys = %v, want [b]", got)
	}

	// Under limit: no next.
	if _, next := Slice([]string{"a"}, 2, key); next != "" {
		t.Fatalf("under-limit next = %q, want empty", next)
	}
}

func TestSliceKeyed(t *testing.T) {
	rows := []string{"a", "b", "c"}
	// The DB-supplied keys are parallel to rows; here they carry a lowercased sort
	// value the caller did NOT compute in Go.
	keys := [][]string{{"A", "1"}, {"B", "2"}, {"C", "3"}}

	// limit+1 rows: trimmed to limit, next is built from keys[limit-1] (not the row).
	items, next := SliceKeyed(rows, keys, 2)
	if len(items) != 2 || items[1] != "b" {
		t.Fatalf("over-limit items = %v, want [a b]", items)
	}
	got, _ := DecodeCursor(next)
	if len(got) != 2 || got[0] != "B" || got[1] != "2" {
		t.Fatalf("next cursor keys = %v, want [B 2] (the DB key, verbatim)", got)
	}

	// Exactly limit rows: last page, no next.
	if _, next := SliceKeyed(rows[:2], keys[:2], 2); next != "" {
		t.Fatalf("full-but-not-over next = %q, want empty", next)
	}
}

func TestLinkHeader(t *testing.T) {
	if got := LinkHeader("/orgs/acme/projects", Query{}, ""); got != "" {
		t.Fatalf("no next should yield empty Link, got %q", got)
	}
	got := LinkHeader("/orgs/acme/projects", Query{Q: "web", Limit: 25}, "CURSOR")
	if !strings.HasPrefix(got, "<") || !strings.HasSuffix(got, `>; rel="next"`) {
		t.Fatalf("Link not RFC 5988 shaped: %q", got)
	}
	// The next link must be a complete, replayable request: path + q + limit + cursor.
	inner := strings.TrimSuffix(strings.TrimPrefix(got, "<"), `>; rel="next"`)
	u, err := url.Parse(inner)
	if err != nil {
		t.Fatalf("Link URL parse: %v", err)
	}
	if u.Path != "/orgs/acme/projects" {
		t.Errorf("path = %q", u.Path)
	}
	q := u.Query()
	if q.Get("q") != "web" || q.Get("limit") != "25" || q.Get("cursor") != "CURSOR" {
		t.Errorf("query = %v, want q=web limit=25 cursor=CURSOR", q)
	}
}
