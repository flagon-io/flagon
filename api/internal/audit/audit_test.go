package audit

import (
	"testing"
	"time"
)

func TestCursorRoundTrip(t *testing.T) {
	want := Cursor{
		CreatedAt: time.Date(2026, 9, 18, 9, 28, 34, 300391000, time.UTC),
		ID:        "fe443952-6da2-4939-b8ed-154d8e326ee1",
	}
	got, err := DecodeCursor(want.Encode())
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got == nil {
		t.Fatal("decode returned nil for a real cursor")
	}
	if !got.CreatedAt.Equal(want.CreatedAt) {
		t.Errorf("created_at = %v, want %v", got.CreatedAt, want.CreatedAt)
	}
	if got.ID != want.ID {
		t.Errorf("id = %q, want %q", got.ID, want.ID)
	}
}

func TestDecodeCursor_Empty(t *testing.T) {
	got, err := DecodeCursor("")
	if err != nil || got != nil {
		t.Fatalf("empty cursor should be (nil, nil), got (%v, %v)", got, err)
	}
}

func TestDecodeCursor_Invalid(t *testing.T) {
	for _, bad := range []string{"not-base64!!", "Zm9vYmFy", "bm9waXBl"} {
		if _, err := DecodeCursor(bad); err == nil {
			t.Errorf("DecodeCursor(%q) should error", bad)
		}
	}
}

// TestActionsComplete guards that every declared Action constant is listed in
// Actions (the set the filter UI and validation enumerate).
func TestActionsComplete(t *testing.T) {
	if len(Actions) < 10 {
		t.Fatalf("expected the full action set, got %d", len(Actions))
	}
	seen := map[Action]bool{}
	for _, a := range Actions {
		if a == "" {
			t.Error("empty action in Actions")
		}
		if seen[a] {
			t.Errorf("duplicate action %q in Actions", a)
		}
		seen[a] = true
	}
	for _, a := range []Action{
		ActionProjectCreated, ActionProjectUpdated, ActionProjectDeleted, ActionProjectRestored,
		ActionMemberAdded, ActionMemberRoleChange, ActionMemberRemoved,
		ActionInvitationSent, ActionInvitationRevoke, ActionOrgUpdated, ActionOrgAuditConfig,
	} {
		if !seen[a] {
			t.Errorf("action %q is declared but missing from Actions", a)
		}
	}
}
