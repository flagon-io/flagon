package service

import (
	"errors"
	"fmt"
	"net/http"
	"testing"

	"github.com/flagon-io/flagon/api/internal/db"
	"github.com/flagon-io/flagon/api/internal/paginate"
)

func TestSlugify(t *testing.T) {
	for in, want := range map[string]string{
		"Acme Corp.":         "acme-corp",
		"  --Hello  World--": "hello-world",
		"Web_App 2":          "web-app-2",
		"!!!":                "",
		"already-a-slug":     "already-a-slug",
	} {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNameAndSlug(t *testing.T) {
	name, slug, err := nameAndSlug("  Acme Corp ", "")
	if err != nil || name != "Acme Corp" || slug != "acme-corp" {
		t.Fatalf("derived slug: got (%q, %q, %v)", name, slug, err)
	}
	// An explicit slug is normalized by the same rule (the tools used to skip
	// this; the service is now the one place it happens).
	if _, slug, _ := nameAndSlug("Acme", "My Org!"); slug != "my-org" {
		t.Fatalf("explicit slug should be normalized, got %q", slug)
	}
	if _, _, err := nameAndSlug("!!!", ""); err == nil {
		t.Fatal("a name with no letters or digits should be rejected")
	}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		err    error
		over   []Override
		status int
		msg    string
	}{
		{db.ErrForbidden, nil, http.StatusForbidden, "you don't have permission to do that"},
		{fmt.Errorf("wrapped: %w", db.ErrProjectNotFound), nil, http.StatusNotFound, "project not found"},
		{paginate.ErrBadCursor, nil, http.StatusUnprocessableEntity, "invalid pagination cursor"},
		{db.ErrOrgLimitReached, nil, http.StatusPaymentRequired, "the free plan includes one organization; add a payment method to create more"},
		{db.ErrInviteExpired, nil, http.StatusGone, "this invitation has expired"},
		{db.ErrTargetNotMember, nil, http.StatusConflict, "that user must be an organization member first"},
		{db.ErrTargetNotMember, memberOverrides, http.StatusNotFound, "that user is not a member"},
		{Invalid("name is required"), nil, http.StatusUnprocessableEntity, "name is required"},
	}
	for _, tc := range cases {
		e, ok := Classify(tc.err, tc.over...)
		if !ok || e.Status != tc.status || e.Message != tc.msg {
			t.Errorf("Classify(%v) = %+v, %v; want %d %q", tc.err, e, ok, tc.status, tc.msg)
		}
	}
	if _, ok := Classify(errors.New("dial tcp: connection refused")); ok {
		t.Error("an unknown error must not classify (it is an internal fault)")
	}
	if got := PublicMessage(errors.New(`pq: relation "secret" does not exist`)); got == "" || got == `pq: relation "secret" does not exist` {
		t.Errorf("PublicMessage leaked an internal error: %q", got)
	}
	// Classification keeps the sentinel reachable.
	if err := classify(db.ErrForbidden); !errors.Is(err, db.ErrForbidden) {
		t.Error("classified error should still match its sentinel")
	}
}
