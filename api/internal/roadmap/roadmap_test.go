package roadmap

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestSplitBody(t *testing.T) {
	summary, includes := splitBody("A short summary.\n\nSecond line of summary.\n\n- one\n- two\n\ntrailing prose is ignored")
	if want := "A short summary. Second line of summary."; summary != want {
		t.Errorf("summary = %q, want %q", summary, want)
	}
	if want := []string{"one", "two"}; !reflect.DeepEqual(includes, want) {
		t.Errorf("includes = %v, want %v", includes, want)
	}
}

func TestSplitBody_NoBullets(t *testing.T) {
	summary, includes := splitBody("Just a summary, no list.")
	if summary != "Just a summary, no list." {
		t.Errorf("summary = %q", summary)
	}
	if includes != nil {
		t.Errorf("includes = %v, want nil", includes)
	}
}

func TestBuildFromDir(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "platform.mdx", `---
title: The platform
stage: concept
team: Engineering
tag: Foundation
order: 1
---

The foundation everything builds on.

- Multi-tenant
- API and CLI
`)
	write(t, dir, "sync.mdx", `---
title: Bidirectional sync
stage: alpha
team: Integrations
---

Keep definitions in sync with the tools you already use.
`)
	// A README without frontmatter must be skipped.
	write(t, dir, "README.md", "# Roadmap\n\nnotes")

	c, err := BuildFromDir(dir)
	if err != nil {
		t.Fatalf("BuildFromDir: %v", err)
	}
	if len(c.Items) != 2 {
		t.Fatalf("got %d items, want 2", len(c.Items))
	}
	// Sorted by slug: "platform" before "sync".
	if c.Items[0].Slug != "platform" || c.Items[1].Slug != "sync" {
		t.Fatalf("slugs = %q, %q", c.Items[0].Slug, c.Items[1].Slug)
	}
	p := c.Items[0]
	if p.Title != "The platform" || p.Stage != Concept || p.Team != "Engineering" || p.Tag != "Foundation" || p.Order != 1 {
		t.Errorf("platform frontmatter wrong: %+v", p)
	}
	if want := []string{"Multi-tenant", "API and CLI"}; !reflect.DeepEqual(p.Includes, want) {
		t.Errorf("includes = %v, want %v", p.Includes, want)
	}
}

func TestBuildFromDir_InvalidStage(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "x.mdx", "---\ntitle: X\nstage: shipped\nteam: Eng\n---\n\nbody\n")
	if _, err := BuildFromDir(dir); err == nil {
		t.Fatal("expected an error for an invalid stage")
	}
}

func TestBuildFromDir_MissingTeam(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "x.mdx", "---\ntitle: X\nstage: beta\n---\n\nbody\n")
	if _, err := BuildFromDir(dir); err == nil {
		t.Fatal("expected an error for a missing team")
	}
}

func TestBoardOrderAndTeams(t *testing.T) {
	b := New(Corpus{Items: []Item{
		{Slug: "b", Title: "Beta thing", Stage: Beta, Team: "Platform"},
		{Slug: "a", Title: "Concept thing", Stage: Concept, Team: "Engineering"},
		{Slug: "c", Title: "Alpha thing", Stage: Alpha, Team: "Engineering"},
	}})
	// Board order is by stage: concept, alpha, beta.
	got := []string{string(b.Items()[0].Stage), string(b.Items()[1].Stage), string(b.Items()[2].Stage)}
	want := []string{"concept", "alpha", "beta"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("stage order = %v, want %v", got, want)
	}
	if teams := b.Teams(); !reflect.DeepEqual(teams, []string{"Engineering", "Platform"}) {
		t.Errorf("teams = %v", teams)
	}
	if len(b.Stages()) != 3 {
		t.Errorf("expected 3 stage columns, got %d", len(b.Stages()))
	}
}

func write(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
