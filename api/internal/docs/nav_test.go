package docs

import (
	"reflect"
	"strings"
	"testing"
)

// navFixture writes a small docs tree with root and folder meta.json files.
func navFixture(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	write(t, dir, "index.mdx", "---\ntitle: Welcome\n---\n\nStart here.\n")
	write(t, dir, "meta.json", `{
  "groups": [
    { "title": "Get started", "sections": ["get-started"] },
    { "title": "Developers", "sections": ["api", "cli"] }
  ],
  "exclude": ["handbook"]
}`)
	write(t, dir, "get-started/intro.mdx", "---\ntitle: Introduction\n---\n\nhi\n")
	write(t, dir, "get-started/quickstart.mdx", "---\ntitle: Quickstart\n---\n\nhi\n")
	write(t, dir, "api/meta.json", `{
  "title": "HTTP API",
  "pages": ["using", "---Basics---", "auth", "errors"]
}`)
	write(t, dir, "api/using.mdx", "---\ntitle: Using the API\nsection: Ignored\n---\n\nhi\n")
	write(t, dir, "api/auth.mdx", "---\ntitle: Authentication\n---\n\nhi\n")
	write(t, dir, "api/errors.mdx", "---\ntitle: Errors\n---\n\nhi\n")
	write(t, dir, "api/zeta.mdx", "---\ntitle: Zeta\norder: 2\n---\n\nunlisted\n")
	write(t, dir, "api/alpha.mdx", "---\ntitle: Alpha\norder: 1\n---\n\nunlisted\n")
	write(t, dir, "api/secret.mdx", "---\ntitle: Secret\nvisibility: internal\n---\n\nhidden\n")
	write(t, dir, "cli/overview.mdx", "---\ntitle: CLI\nstatus: planned\n---\n\n")
	write(t, dir, "roadmap-thing/overview.mdx", "---\ntitle: Later\n---\n\nhi\n")
	write(t, dir, "handbook/pay.mdx", "---\ntitle: Pay\n---\n\nhi\n")
	return dir
}

func TestBuildFromDir_Nav(t *testing.T) {
	c, err := BuildFromDir(navFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	nav := c.Nav
	if nav == nil || nav.Index == nil || nav.Index.Slug != IndexSlug || nav.Index.Title != "Welcome" {
		t.Fatalf("expected the landing page as nav.index, got %#v", nav)
	}

	var groups []string
	for _, g := range nav.Groups {
		groups = append(groups, g.Title)
	}
	// Grouped folders in order, then the unplaced folder in the trailing group;
	// the excluded handbook appears nowhere.
	if want := []string{"Get started", "Developers", "More"}; !reflect.DeepEqual(groups, want) {
		t.Fatalf("groups = %v, want %v", groups, want)
	}
	if s := nav.Groups[2].Sections; len(s) != 1 || s[0].Folder != "roadmap-thing" || s[0].Title != "Roadmap thing" {
		t.Fatalf("trailing group = %#v", s)
	}

	api := nav.Groups[1].Sections[0]
	if api.Folder != "api" || api.Title != "HTTP API" {
		t.Fatalf("api section = %q/%q", api.Folder, api.Title)
	}
	var items []string
	for _, it := range api.Items {
		if it.Type == NavSeparator {
			items = append(items, "--"+it.Title)
		} else {
			items = append(items, it.Slug)
		}
	}
	// Listed order with the separator, then unlisted pages by order; the
	// internal page never appears.
	want := []string{"api/using", "--Basics", "api/auth", "api/errors", "api/alpha", "api/zeta"}
	if !reflect.DeepEqual(items, want) {
		t.Fatalf("api items = %v, want %v", items, want)
	}

	cli := nav.Groups[1].Sections[1]
	if cli.Title != "CLI" || cli.Items[0].Status != "planned" {
		t.Fatalf("cli section = %#v", cli)
	}

	// The folder meta.json title is every page's section, even over frontmatter.
	for _, d := range c.Docs {
		if folderOf(d.Slug) == "api" && d.Section != "HTTP API" {
			t.Errorf("%s section = %q, want the meta.json title", d.Slug, d.Section)
		}
	}
}

func TestIndexOrderFollowsNav(t *testing.T) {
	c, err := BuildFromDir(navFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	idx := NewIndex(c)
	var got []string
	for _, m := range idx.List(false) {
		got = append(got, m.Slug)
	}
	want := []string{
		"index",
		"get-started/intro", "get-started/quickstart",
		"api/using", "api/auth", "api/errors", "api/alpha", "api/zeta",
		"cli/overview",
		"roadmap-thing/overview",
		"handbook/pay", // not in the nav: after it
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("list order =\n%v\nwant\n%v", got, want)
	}
	if n := idx.Nav(); len(n.Groups) != 3 {
		t.Fatalf("index nav groups = %d", len(n.Groups))
	}
}

func TestBuildFromDir_NoMetaStillBuildsNav(t *testing.T) {
	dir := t.TempDir()
	write(t, dir, "platform/one.mdx", "---\ntitle: One\nsection: Things\n---\n\nhi\n")
	c, err := BuildFromDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	if c.Nav == nil || len(c.Nav.Groups) != 1 || c.Nav.Groups[0].Title != "More" {
		t.Fatalf("expected one trailing group, got %#v", c.Nav)
	}
	// Frontmatter section beats the humanized folder when there is no meta title.
	if got := c.Nav.Groups[0].Sections[0].Title; got != "Things" {
		t.Fatalf("section title = %q, want Things", got)
	}
	if c.Nav.Index != nil {
		t.Fatal("no index.mdx means no landing page in the nav")
	}
}

func TestBuildFromDir_NavErrors(t *testing.T) {
	cases := map[string]struct {
		files map[string]string
		want  string
	}{
		"missing page": {
			files: map[string]string{"api/meta.json": `{"pages": ["nope"]}`},
			want:  `lists page "nope"`,
		},
		"duplicate page": {
			files: map[string]string{"api/meta.json": `{"pages": ["a", "a"]}`},
			want:  "listed more than once",
		},
		"bad separator": {
			files: map[string]string{"api/meta.json": `{"pages": ["------"]}`},
			want:  "not a valid separator",
		},
		"unknown field": {
			files: map[string]string{"api/meta.json": `{"page": ["a"]}`},
			want:  "unknown field",
		},
		"missing folder": {
			files: map[string]string{"meta.json": `{"groups": [{"title": "G", "sections": ["ghost"]}]}`},
			want:  `folder "ghost", which does not exist`,
		},
		"folder twice": {
			files: map[string]string{"meta.json": `{"groups": [{"title": "G", "sections": ["api"]}, {"title": "H", "sections": ["api"]}]}`},
			want:  "listed more than once",
		},
		"untitled group": {
			files: map[string]string{"meta.json": `{"groups": [{"title": "", "sections": ["api"]}]}`},
			want:  "has no title",
		},
		"grouped and excluded": {
			files: map[string]string{"meta.json": `{"groups": [{"title": "G", "sections": ["api"]}], "exclude": ["api"]}`},
			want:  "both grouped and excluded",
		},
		"malformed": {
			files: map[string]string{"meta.json": `{"groups": [`},
			want:  "parse meta.json",
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			write(t, dir, "api/a.mdx", "---\ntitle: A\n---\n\nhi\n")
			for p, content := range tc.files {
				write(t, dir, p, content)
			}
			_, err := BuildFromDir(dir)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want it to mention %q", err, tc.want)
			}
		})
	}
}

func TestSeparatorLabel(t *testing.T) {
	cases := map[string]string{
		"---Set up---":    "Set up",
		"--- Spaced ---":  "Spaced",
		"------":          "",
		"page":            "",
		"---unterminated": "",
		"---Automate----": "Automate-",
	}
	for in, want := range cases {
		got, ok := separatorLabel(in)
		if got != want || ok != (want != "") {
			t.Errorf("separatorLabel(%q) = %q, %v; want %q", in, got, ok, want)
		}
	}
}

// The real docs tree must always compile: this is the same check gendocs runs,
// so a broken meta.json fails `go test` too, not just `make docs`.
func TestRealDocsTreeBuilds(t *testing.T) {
	c, err := BuildFromDir("../../../docs")
	if err != nil {
		t.Fatalf("docs/ does not compile: %v", err)
	}
	if c.Nav == nil || len(c.Nav.Groups) == 0 {
		t.Fatal("expected the real docs tree to produce a grouped nav")
	}
	for _, g := range c.Nav.Groups {
		for _, s := range g.Sections {
			if s.Folder == "handbook" {
				t.Fatal("the handbook has its own surface and must not be in the docs nav")
			}
		}
	}
}
