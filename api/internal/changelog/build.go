package changelog

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// isoDate matches the YYYY-MM-DD dates the changelog uses. It is a shape check,
// not a calendar check: a malformed date is a build-time mistake worth catching.
var isoDate = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// BuildFromDir compiles the changelog/ tree rooted at dir into a Corpus. It is
// the single source of truth for how source files become the corpus, shared by
// cmd/genchangelog and the tests, so generation and verification can never
// disagree.
//
// A Markdown/MDX file is included only if its frontmatter has both a title and a
// valid date; files without frontmatter (README, notes) are skipped. Entries are
// sorted by slug so the output is deterministic and diff-friendly.
func BuildFromDir(dir string) (Corpus, error) {
	root := os.DirFS(dir)
	var entries []Entry

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
			return nil // no frontmatter/title: not an entry (e.g. README)
		}
		entry, err := entryFrom(p, fm, body)
		if err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		entries = append(entries, entry)
		return nil
	})
	if err != nil {
		return Corpus{}, err
	}

	sort.SliceStable(entries, func(i, j int) bool { return entries[i].Slug < entries[j].Slug })

	// Slugs (leaf filenames) must be unique so two files can't collide.
	seen := map[string]bool{}
	for _, e := range entries {
		if seen[e.Slug] {
			return Corpus{}, fmt.Errorf("duplicate changelog slug %q: filenames must be unique", e.Slug)
		}
		seen[e.Slug] = true
	}
	return Corpus{Entries: entries}, nil
}

// entryFrom assembles an Entry from a file's path, frontmatter, and body. The
// slug is the leaf filename (the changelog tree is flat).
func entryFrom(p string, fm map[string]string, body string) (Entry, error) {
	slug := strings.TrimSuffix(path.Base(filepath.ToSlash(p)), filepath.Ext(p))

	date := strings.TrimSpace(fm["date"])
	if !isoDate.MatchString(date) {
		return Entry{}, fmt.Errorf("date %q is not a YYYY-MM-DD date", fm["date"])
	}

	return Entry{
		Slug:  slug,
		Title: strings.TrimSpace(fm["title"]),
		Date:  date,
		Tag:   strings.TrimSpace(fm["tag"]),
		Area:  strings.TrimSpace(fm["area"]),
		Body:  strings.TrimSpace(body),
	}, nil
}

// splitFrontmatter separates a leading YAML frontmatter block (fenced by ---)
// from the body. It parses only the flat "key: value" subset the convention
// uses, which keeps the toolchain dependency-free (matching internal/docs and
// internal/roadmap). Returns ok=false when there is no frontmatter block.
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

// Marshal renders a Corpus to the exact bytes written to changelog.gen.json:
// indented, trailing newline, deterministic. genchangelog uses this for both
// writing and the -check drift comparison.
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
var CorpusPath = path.Join("internal", "changelog", "changelog.gen.json")
