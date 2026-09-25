package docs

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSplitFrontmatter(t *testing.T) {
	raw := []byte("---\ntitle: Hello\nvisibility: internal\norder: 3\n---\n\nBody text here.\n")
	fm, body, ok := splitFrontmatter(raw)
	if !ok {
		t.Fatal("expected frontmatter to be found")
	}
	if fm["title"] != "Hello" || fm["visibility"] != "internal" || fm["order"] != "3" {
		t.Fatalf("unexpected frontmatter: %#v", fm)
	}
	if strings.TrimSpace(body) != "Body text here." {
		t.Fatalf("unexpected body: %q", body)
	}
}

func TestSplitFrontmatter_None(t *testing.T) {
	if _, _, ok := splitFrontmatter([]byte("# Just a readme\n")); ok {
		t.Fatal("expected no frontmatter for a plain markdown file")
	}
}

func TestBuildFromDir(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "platform/one.mdx", "---\ntitle: One\nsection: platform\n---\n\n## Alpha\nbody one\n")
	write(t, dir, "secret.mdx", "---\ntitle: Secret\nvisibility: internal\n---\n\nhidden\n")
	write(t, dir, "README.md", "# not a doc\n") // no frontmatter -> skipped

	c, err := BuildFromDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Docs) != 2 {
		t.Fatalf("expected 2 docs (README skipped), got %d", len(c.Docs))
	}
	// Deterministic order by slug.
	if c.Docs[0].Slug != "platform/one" || c.Docs[1].Slug != "secret" {
		t.Fatalf("unexpected slugs/order: %q, %q", c.Docs[0].Slug, c.Docs[1].Slug)
	}
	if c.Docs[0].Section != "platform" || c.Docs[0].Visibility != Public {
		t.Fatalf("unexpected defaults: %#v", c.Docs[0])
	}
	if len(c.Docs[0].Headings) != 1 || c.Docs[0].Headings[0] != "Alpha" {
		t.Fatalf("expected heading Alpha, got %#v", c.Docs[0].Headings)
	}
	if c.Docs[1].Visibility != Internal {
		t.Fatalf("expected internal visibility, got %q", c.Docs[1].Visibility)
	}
}

func TestHumanize(t *testing.T) {
	cases := map[string]string{
		"get-started":  "Get started",
		"api":          "API",
		"ai":           "AI",
		"self-hosting": "Self hosting",
		"open-source":  "Open source",
		"platform":     "Platform",
	}
	for dir, want := range cases {
		if got := humanize(dir); got != want {
			t.Errorf("humanize(%q) = %q, want %q", dir, got, want)
		}
	}
}

func TestBuildFromDir_DirectoryDefaultsAndStatus(t *testing.T) {
	dir := t.TempDir()
	// No section frontmatter: the directory name is the default category.
	write(t, dir, "get-started/intro.mdx", "---\ntitle: Intro\n---\n\nhi\n")
	write(t, dir, "api/tokens.mdx", "---\ntitle: Tokens\n---\n\nhi\n")
	// A planned placeholder.
	write(t, dir, "cli/overview.mdx", "---\ntitle: CLI\nstatus: planned\n---\n\n")

	c, err := BuildFromDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	bySlug := map[string]Doc{}
	for _, d := range c.Docs {
		bySlug[d.Slug] = d
	}
	if bySlug["get-started/intro"].Section != "Get started" {
		t.Errorf("directory default = %q, want %q", bySlug["get-started/intro"].Section, "Get started")
	}
	if bySlug["api/tokens"].Section != "API" {
		t.Errorf("acronym default = %q, want %q", bySlug["api/tokens"].Section, "API")
	}
	if !bySlug["cli/overview"].Planned() {
		t.Errorf("expected cli/overview to be planned")
	}
}

func testIndex() *Index {
	return NewIndex(Corpus{Docs: []Doc{
		{Slug: "platform/projects", Title: "Projects", Description: "The core deployable unit.", Section: "platform", Visibility: Public, Body: "A project is deployable."},
		{Slug: "platform/overview", Title: "Overview", Section: "platform", Visibility: Public, Body: "Flagon mentions projects once in passing."},
		{Slug: "handbook/pay", Title: "Compensation", Section: "handbook", Visibility: Internal, Body: "How we think about pay and salary bands."},
	}})
}

func TestSearchVisibility(t *testing.T) {
	idx := testIndex()

	if hits := idx.Search("salary pay", false, 0); len(hits) != 0 {
		t.Fatalf("public search must not return internal docs, got %d hits", len(hits))
	}
	hits := idx.Search("salary pay", true, 0)
	if len(hits) != 1 || hits[0].Doc.Slug != "handbook/pay" {
		t.Fatalf("internal search should find the pay doc, got %#v", hits)
	}
}

func TestSearchRanking(t *testing.T) {
	idx := testIndex()
	hits := idx.Search("projects", false, 0)
	if len(hits) != 2 {
		t.Fatalf("expected both public docs to match 'projects', got %d", len(hits))
	}
	// Title+description match must outrank a passing body mention.
	if hits[0].Doc.Slug != "platform/projects" {
		t.Fatalf("expected projects doc ranked first, got %q", hits[0].Doc.Slug)
	}
	if hits[0].Snippet == "" {
		t.Fatal("expected a non-empty snippet")
	}
}

func TestGetAndListVisibility(t *testing.T) {
	idx := testIndex()

	if _, ok := idx.Get("handbook/pay", false); ok {
		t.Fatal("internal doc must be withheld from public Get")
	}
	if _, ok := idx.Get("handbook/pay", true); !ok {
		t.Fatal("internal doc should be returned when internal is included")
	}
	if got := len(idx.List(false)); got != 2 {
		t.Fatalf("public list should have 2 docs, got %d", got)
	}
	if got := len(idx.List(true)); got != 3 {
		t.Fatalf("full list should have 3 docs, got %d", got)
	}
}

func write(t *testing.T, dir, rel, content string) {
	t.Helper()
	p := filepath.Join(dir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
