package docs

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

// BuildFromDir compiles the docs/ tree rooted at dir into a Corpus. It is the
// single source of truth for how source files become the corpus, shared by
// cmd/gendocs and the tests, so generation and verification can never disagree.
//
// A Markdown/MDX file is included only if its frontmatter has a title; files
// without frontmatter (READMEs, notes) are skipped. Docs are sorted by slug so
// the output is deterministic and diff-friendly.
func BuildFromDir(dir string) (Corpus, error) {
	root := os.DirFS(dir)
	var docsOut []Doc

	err := fs.WalkDir(root, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(p))
		if ext != ".md" && ext != ".mdx" {
			return nil
		}
		raw, err := fs.ReadFile(root, p)
		if err != nil {
			return fmt.Errorf("read %s: %w", p, err)
		}
		fm, body, ok := splitFrontmatter(raw)
		if !ok || strings.TrimSpace(fm["title"]) == "" {
			return nil // no frontmatter/title: not a doc (e.g. README)
		}
		docsOut = append(docsOut, docFrom(p, fm, body))
		return nil
	})
	if err != nil {
		return Corpus{}, err
	}

	sort.SliceStable(docsOut, func(i, j int) bool { return docsOut[i].Slug < docsOut[j].Slug })

	// Slugs must be unique. Because intermediate directories are dropped from the
	// slug, two files could collide (docs/a/x.mdx and docs/a/sub/x.mdx); fail
	// loudly rather than silently drop one.
	seen := map[string]bool{}
	for _, d := range docsOut {
		if seen[d.Slug] {
			return Corpus{}, fmt.Errorf("duplicate doc slug %q: leaf filenames must be unique within a top-level section", d.Slug)
		}
		seen[d.Slug] = true
	}
	return Corpus{Docs: docsOut}, nil
}

// docFrom assembles a Doc from a file's path, frontmatter, and body.
func docFrom(p string, fm map[string]string, body string) Doc {
	rel := strings.TrimSuffix(filepath.ToSlash(p), filepath.Ext(p))
	parts := strings.Split(rel, "/")

	// The slug keeps <top-section>/<leaf> and drops intermediate (category)
	// directories, so a page can be grouped into a subfolder for tidiness without
	// changing its URL: docs/handbook/how-we-work/communication.mdx still serves
	// as handbook/communication.
	slug := rel
	if len(parts) > 2 {
		slug = parts[0] + "/" + parts[len(parts)-1]
	}

	section := strings.TrimSpace(fm["section"])
	if section == "" && len(parts) >= 2 {
		// Default the category to the immediate parent directory, humanized, so
		// the folder is the category unless a page overrides it
		// (docs/get-started/x.mdx -> "Get started"; docs/handbook/hiring/y.mdx ->
		// "Hiring").
		section = humanize(parts[len(parts)-2])
	}

	visibility := Visibility(strings.ToLower(strings.TrimSpace(fm["visibility"])))
	if visibility != Internal {
		visibility = Public
	}

	status := strings.ToLower(strings.TrimSpace(fm["status"]))
	if status != "planned" {
		status = ""
	}

	order := 0
	if v := strings.TrimSpace(fm["order"]); v != "" {
		order, _ = strconv.Atoi(v)
	}

	return Doc{
		Slug:        slug,
		Title:       strings.TrimSpace(fm["title"]),
		Description: strings.TrimSpace(fm["description"]),
		Section:     section,
		Visibility:  visibility,
		Status:      status,
		Order:       order,
		Headings:    headings(body),
		Body:        strings.TrimSpace(body),
	}
}

// acronyms are directory words rendered upper-case in a humanized section label.
var acronyms = map[string]string{
	"api": "API", "ai": "AI", "mcp": "MCP", "cli": "CLI", "sdk": "SDK",
	"ci": "CI", "cd": "CD", "ui": "UI", "dora": "DORA", "rls": "RLS",
}

// humanize turns a directory name into a display label: dashes become spaces,
// the first word is capitalized (sentence case), and known acronyms are upper-
// cased. "get-started" -> "Get started"; "api" -> "API"; "self-hosting" ->
// "Self hosting". A page's own `section:` frontmatter always wins over this.
func humanize(dir string) string {
	words := strings.Split(dir, "-")
	for i, w := range words {
		if w == "" {
			continue
		}
		if a, ok := acronyms[strings.ToLower(w)]; ok {
			words[i] = a
			continue
		}
		if i == 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

// splitFrontmatter separates a leading YAML frontmatter block (fenced by ---)
// from the body. It parses only the flat "key: value" subset the doc convention
// uses, which keeps the toolchain dependency-free. Returns ok=false when there is
// no frontmatter block.
func splitFrontmatter(raw []byte) (map[string]string, string, bool) {
	s := strings.ReplaceAll(string(raw), "\r\n", "\n")
	if !strings.HasPrefix(s, "---\n") {
		return nil, s, false
	}
	rest := s[len("---\n"):]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return nil, s, false
	}
	block := rest[:end]
	body := rest[end+len("\n---"):]
	body = strings.TrimPrefix(body, "\n")

	fm := map[string]string{}
	for _, line := range strings.Split(block, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		fm[strings.TrimSpace(key)] = unquote(strings.TrimSpace(val))
	}
	return fm, body, true
}

func unquote(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}

// headings pulls the ATX headings (## ...) out of the body for search weighting.
func headings(body string) []string {
	var out []string
	for _, line := range strings.Split(body, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "#") {
			out = append(out, strings.TrimSpace(strings.TrimLeft(line, "#")))
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

// Marshal renders a Corpus to the exact bytes written to corpus.gen.json:
// indented, trailing newline, deterministic. gendocs uses this for both writing
// and the -check drift comparison.
func Marshal(c Corpus) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(c); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// CorpusPath is where the generated corpus lives, relative to the api module root.
var CorpusPath = path.Join("internal", "docs", "corpus.gen.json")
