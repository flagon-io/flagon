package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/flagon-io/flagon/api/internal/db"
)

// TestDeleteOrgNotifiesMembers: deleting an org tells its members (the fake
// store returns one) through the shared service, so every front door notifies.
func TestDeleteOrgNotifiesMembers(t *testing.T) {
	store := newFakeStore(nil)
	s := newTestServer(t, store)
	rec := s.call(http.MethodDelete, "/orgs/acme", testInternalToken, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("delete-org = %d (body: %s)", rec.Code, rec.Body.String())
	}
	notes := store.notifications()
	if len(notes) != 1 || notes[0] != "org.deleted" {
		t.Fatalf("notifications = %v, want [org.deleted]", notes)
	}
}

// TestOrgDeleteRestoreStatuses pins the statuses the org delete/restore
// sentinels map to on the REST surface.
func TestOrgDeleteRestoreStatuses(t *testing.T) {
	cases := []struct {
		name         string
		err          error
		method, path string
		body         string
		want         int
	}{
		{"non-owner cannot delete", db.ErrForbidden, http.MethodDelete, "/orgs/acme", "", http.StatusForbidden},
		{"unknown org is not found", db.ErrNotMember, http.MethodDelete, "/orgs/acme", "", http.StatusNotFound},
		{"restore with taken slug conflicts", db.ErrOrgSlugTaken, http.MethodPost, "/deleted-orgs/" + testOrgID + "/restore", "", http.StatusConflict},
		{"restore past the plan limit needs payment", db.ErrOrgLimitReached, http.MethodPost, "/deleted-orgs/" + testOrgID + "/restore", `{"slug":"acme-2"}`, http.StatusPaymentRequired},
		{"restore outside retention is not found", db.ErrNotMember, http.MethodPost, "/deleted-orgs/" + testOrgID + "/restore", "", http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store := newFakeStore(nil)
			store.err = tc.err
			s := newTestServer(t, store)
			rec := s.call(tc.method, tc.path, testInternalToken, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("%s %s = %d, want %d (body: %s)", tc.method, tc.path, rec.Code, tc.want, rec.Body.String())
			}
		})
	}
}

// TestRestoreOrgBodyIsOptional: restore works with no request body at all.
func TestRestoreOrgBodyIsOptional(t *testing.T) {
	s := newTestServer(t, newFakeStore(nil))
	req := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/deleted-orgs/"+testOrgID+"/restore", nil)
	req.Header.Set("Authorization", "Bearer "+testInternalToken)
	req.Header.Set("X-Flagon-User-Id", "u1")
	rec := httptest.NewRecorder()
	s.handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("restore-org with no body = %d (body: %s)", rec.Code, rec.Body.String())
	}
}
