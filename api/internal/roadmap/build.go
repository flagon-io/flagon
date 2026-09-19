package roadmap

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

// BuildFromDir compiles the roadmap/ tree rooted at dir into a Corpus. It is the
// single source of truth for how source files become the corpus, shared by
// cmd/genroadmap and the tests, so generation and verification can never
// disagree.
//
// A Markdown/MDX file is included only if its frontmatter has both a title and a
// valid stage; files without frontmatter (README, notes) are skipped. Items are
// sorted by slug so the output is deterministic and diff-friendly.
func BuildFromDir(dir string) (Corpus, error) {
	root := os.DirFS(dir)
	var items []Item

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
			return nil // no frontmatter/title: not an item (e.g. README)
		}
		item, err := itemFrom(p, fm, body)
		if err != nil {
			return fmt.Errorf("%s: %w", p, err)
		}
		items = append(items, item)
		return nil
	})
	if err != nil {
		return Corpus{}, err
	}

	sort.SliceStable(items, func(i, j int) bool { return items[i].Slug < items[j].Slug })

	// Slugs (leaf filenames) must be unique so two files can't collide.
	seen := map[string]bool{}
	for _, it := range items {
		if seen[it.Slug] {
			return Corpus{}, fmt.Errorf("duplicate roadmap slug %q: filenames must be unique", it.Slug)
		}
		seen[it.Slug] = true
	}
	return Corpus{Items: items}, nil
}

// itemFrom assembles an Item from a file's path, frontmatter, and body. The slug
// is the leaf filename (the roadmap tree is flat); the body's prose becomes the
// summary and its bullet list becomes the includes.
func itemFrom(p string, fm map[string]string, body string) (Item, error) {
	slug := strings.TrimSuffix(path.Base(filepath.ToSlash(p)), filepath.Ext(p))

	stage := Stage(strings.ToLower(strings.TrimSpace(fm["stage"])))
	if !stage.Valid() {
		return Item{}, fmt.Errorf("stage %q is not one of concept, alpha, beta", fm["stage"])
	}
	team := strings.TrimSpace(fm["team"])
	if team == "" {
		return Item{}, fmt.Errorf("team is required")
	}

	order := 0
	if v := strings.TrimSpace(fm["order"]); v != "" {
		order, _ = strconv.Atoi(v)
	}

	summary, includes := splitBody(body)

	return Item{
		Slug:     slug,
		Title:    strings.TrimSpace(fm["title"]),
		Stage:    stage,
		Team:     team,
		Tag:      strings.TrimSpace(fm["tag"]),
		Summary:  summary,
		Includes: includes,
		Order:    order,
	}, nil
}

// splitBody separates an item's prose summary from its bullet list. Lines that
// start with "- " or "* " are the includes; everything before the first bullet
// is the summary (its paragraphs joined into a single line). Text after the list
// is ignored, keeping the item shape simple and predictable.
func splitBody(body string) (summary string, includes []string) {
	var summaryLines []string
	inList := false
	for _, line := range strings.Split(body, "\n") {
		t := strings.TrimSpace(line)
		if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "* ") {
			inList = true
			includes = append(includes, strings.TrimSpace(t[2:]))
			continue
		}
		if inList {
			break // the list has ended; ignore any trailing prose
		}
		summaryLines = append(summaryLines, t)
	}
	summary = strings.TrimSpace(strings.Join(summaryLines, " "))
	summary = strings.Join(strings.Fields(summary), " ") // collapse runs of blank space
	return summary, includes
}

// splitFrontmatter separates a leading YAML frontmatter block (fenced by ---)
// from the body. It parses only the flat "key: value" subset the convention
// uses, which keeps the toolchain dependency-free (matching internal/docs).
// Returns ok=false when there is no frontmatter block.
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

// Marshal renders a Corpus to the exact bytes written to roadmap.gen.json:
// indented, trailing newline, deterministic. genroadmap uses this for both
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
var CorpusPath = path.Join("internal", "roadmap", "roadmap.gen.json")
