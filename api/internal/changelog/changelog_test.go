package changelog

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildFromDir(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "2026-09-19-ui.md", `---
title: Flagon UI is live
date: 2026-09-19
tag: Shipped
area: UI
---

The component library shipped at ui.flagon.io.
`)
	write(t, dir, "2026-08-01-api.md", `---
title: Public API
date: 2026-08-01
---

The API is public.
`)
	// A README without frontmatter must be skipped.
	write(t, dir, "README.md", "# Changelog\n\nnotes")

	c, err := BuildFromDir(dir)
	if err != nil {
		t.Fatalf("BuildFromDir: %v", err)
	}
	if len(c.Entries) != 2 {
		t.Fatalf("got %d entries, want 2", len(c.Entries))
	}
	// After New(), entries are newest first regardless of file order.
	l := New(c)
	if l.Entries()[0].Date != "2026-09-19" || l.Entries()[1].Date != "2026-08-01" {
		t.Fatalf("order = %q, %q; want newest first", l.Entries()[0].Date, l.Entries()[1].Date)
	}
	ui := l.Entries()[0]
	if ui.Slug != "2026-09-19-ui" || ui.Title != "Flagon UI is live" || ui.Tag != "Shipped" || ui.Area != "UI" {
		t.Errorf("entry frontmatter wrong: %+v", ui)
	}
	if ui.Body != "The component library shipped at ui.flagon.io." {
		t.Errorf("body = %q", ui.Body)
	}
}

func TestBuildFromDir_BadDate(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "x.md", "---\ntitle: X\ndate: yesterday\n---\n\nbody\n")
	if _, err := BuildFromDir(dir); err == nil {
		t.Fatal("expected an error for a non-ISO date")
	}
}

func TestBuildFromDir_MissingDate(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "x.md", "---\ntitle: X\n---\n\nbody\n")
	if _, err := BuildFromDir(dir); err == nil {
		t.Fatal("expected an error for a missing date")
	}
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
