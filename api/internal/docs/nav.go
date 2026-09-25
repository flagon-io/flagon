package docs

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// IndexSlug is the slug of the docs landing page, compiled from docs/index.mdx.
// Root-level files are the only single-segment slugs, so it cannot collide with
// a page inside a section folder (those are always <folder>/<leaf>).
const IndexSlug = "index"

// MetaFile is the name of the navigation file read from the docs root and from
// each top-level section folder.
const MetaFile = "meta.json"

// trailingGroupTitle labels the group that collects public sections no root
// group lists, so a new folder still shows up in the nav before anyone files it.
const trailingGroupTitle = "More"

// RootMeta is the shape of docs/meta.json: the ordered groups of top-level
// section folders that make up the docs navigation.
type RootMeta struct {
	// Groups are rendered in order; each lists its section folders in order.
	Groups []RootGroup `json:"groups"`
	// Exclude names top-level folders that are not part of the docs nav at all
	// because they have their own surface (the handbook). Their pages stay in
	// the corpus, readable by slug and searchable as before.
	Exclude []string `json:"exclude,omitempty"`
}

// RootGroup is one labeled group in docs/meta.json.
type RootGroup struct {
	Title    string   `json:"title"`
	Sections []string `json:"sections"`
}

// SectionMeta is the shape of docs/<folder>/meta.json: the section's display
// title and its page order. Entries of the form "---Label---" start a labeled
// sub-group (a separator) within the section.
type SectionMeta struct {
	Title string   `json:"title,omitempty"`
	Pages []string `json:"pages,omitempty"`
}

// Nav is the compiled docs navigation: the landing page, then groups of
// sections of items. It holds public pages only; internal pages never appear.
type Nav struct {
	Index  *NavItem   `json:"index,omitempty"`
	Groups []NavGroup `json:"groups"`
}

// NavGroup is a labeled run of sections ("Get started", "Developers").
type NavGroup struct {
	Title    string       `json:"title"`
	Sections []NavSection `json:"sections"`
}

// NavSection is one top-level docs folder.
type NavSection struct {
	// Folder is the top-level directory name, and the first segment of every
	// page slug in the section.
	Folder string    `json:"folder"`
	Title  string    `json:"title"`
	Items  []NavItem `json:"items"`
}

// Nav item types.
const (
	NavPage      = "page"
	NavSeparator = "separator"
)

// NavItem is either a page link (Type "page": Slug, Title, optional Status) or
// a separator (Type "separator": Title only) that labels the pages after it.
type NavItem struct {
	Type   string `json:"type"`
	Slug   string `json:"slug,omitempty"`
	Title  string `json:"title"`
	Status string `json:"status,omitempty"`
}

// Slugs returns every page slug in the nav in reading order, landing page
// first. Separators are skipped.
func (n *Nav) Slugs() []string {
	if n == nil {
		return nil
	}
	var out []string
	if n.Index != nil {
		out = append(out, n.Index.Slug)
	}
	for _, g := range n.Groups {
		for _, s := range g.Sections {
			for _, it := range s.Items {
				if it.Type == NavPage {
					out = append(out, it.Slug)
				}
			}
		}
	}
	return out
}

// separatorLabel reports whether a meta.json pages entry is a "---Label---"
// separator, returning the trimmed label.
func separatorLabel(entry string) (string, bool) {
	if len(entry) < 6 || !strings.HasPrefix(entry, "---") || !strings.HasSuffix(entry, "---") {
		return "", false
	}
	label := strings.TrimSpace(entry[3 : len(entry)-3])
	return label, label != ""
}

// readJSONStrict decodes a meta.json file, rejecting unknown fields so a typo
// ("page" for "pages") fails the build instead of silently being ignored.
// rel is the file's path relative to the docs root, used in error messages.
// A missing file is not an error: v is left zero.
func readJSONStrict(dir, rel string, v any) error {
	raw, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(rel)))
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("parse %s: %w", rel, err)
	}
	return nil
}

// folderOf returns the top-level folder of a slug, or "" for a root-level page.
func folderOf(slug string) string {
	folder, _, ok := strings.Cut(slug, "/")
	if !ok {
		return ""
	}
	return folder
}

// leafOf returns the last segment of a slug (the filename without extension).
func leafOf(slug string) string {
	if i := strings.LastIndex(slug, "/"); i >= 0 {
		return slug[i+1:]
	}
	return slug
}

// applyNav reads the meta.json files under dir, applies section titles to the
// docs (folder meta.json title wins over frontmatter `section`, which wins over
// the humanized folder name), and compiles the public navigation. docsIn is
// modified in place. Misconfiguration (a listed page or folder that does not
// exist, a duplicate entry, a folder in two groups, an unknown field) is an
// error: navigation mistakes fail the build rather than ship a broken sidebar.
func applyNav(dir string, docsIn []Doc) (*Nav, error) {
	var root RootMeta
	if err := readJSONStrict(dir, MetaFile, &root); err != nil {
		return nil, err
	}

	// Pages per top-level folder, in the corpus's slug order.
	byFolder := map[string][]int{}
	for i, d := range docsIn {
		byFolder[folderOf(d.Slug)] = append(byFolder[folderOf(d.Slug)], i)
	}

	// Validate the root groups and remember which folders they place.
	placed := map[string]bool{}
	excluded := map[string]bool{}
	for _, f := range root.Exclude {
		if excluded[f] {
			return nil, fmt.Errorf("%s: folder %q is excluded twice", MetaFile, f)
		}
		excluded[f] = true
	}
	for gi, g := range root.Groups {
		if strings.TrimSpace(g.Title) == "" {
			return nil, fmt.Errorf("%s: group %d has no title", MetaFile, gi+1)
		}
		for _, f := range g.Sections {
			if f == "" || strings.ContainsAny(f, `/\`) {
				return nil, fmt.Errorf("%s: group %q: %q is not a top-level folder name", MetaFile, g.Title, f)
			}
			if placed[f] {
				return nil, fmt.Errorf("%s: folder %q is listed more than once", MetaFile, f)
			}
			if excluded[f] {
				return nil, fmt.Errorf("%s: folder %q is both grouped and excluded", MetaFile, f)
			}
			if st, err := os.Stat(filepath.Join(dir, f)); err != nil || !st.IsDir() {
				return nil, fmt.Errorf("%s: group %q lists folder %q, which does not exist", MetaFile, g.Title, f)
			}
			placed[f] = true
		}
	}

	// Compile every folder's section (title applied to all its docs, public or
	// not; the nav itself carries public pages only).
	sections := map[string]NavSection{}
	for folder, idxs := range byFolder {
		if folder == "" {
			continue // root-level pages: the landing page, or loose pages below
		}
		var meta SectionMeta
		metaPath := folder + "/" + MetaFile
		if err := readJSONStrict(dir, metaPath, &meta); err != nil {
			return nil, err
		}
		title := strings.TrimSpace(meta.Title)
		for _, i := range idxs {
			if title != "" {
				docsIn[i].Section = title
			}
		}
		sec, err := compileSection(folder, metaPath, meta, docsIn, idxs)
		if err != nil {
			return nil, err
		}
		if title == "" {
			sec.Title = sectionTitleFallback(folder, docsIn, idxs)
		}
		sections[folder] = sec
	}

	nav := &Nav{Groups: []NavGroup{}}
	for _, i := range byFolder[""] {
		d := docsIn[i]
		if d.Slug == IndexSlug && d.Visibility == Public {
			nav.Index = &NavItem{Type: NavPage, Slug: d.Slug, Title: d.Title, Status: d.Status}
		}
	}

	for _, g := range root.Groups {
		group := NavGroup{Title: strings.TrimSpace(g.Title)}
		for _, f := range g.Sections {
			if sec, ok := sections[f]; ok && len(sec.Items) > 0 {
				group.Sections = append(group.Sections, sec)
			}
		}
		if len(group.Sections) > 0 {
			nav.Groups = append(nav.Groups, group)
		}
	}

	// Folders no group lists (and that aren't excluded) trail in a catch-all
	// group, alphabetically, followed by any loose public root-level pages.
	var rest []string
	for f := range sections {
		if !placed[f] && !excluded[f] {
			rest = append(rest, f)
		}
	}
	sort.Strings(rest)
	trailing := NavGroup{Title: trailingGroupTitle}
	for _, f := range rest {
		if sec := sections[f]; len(sec.Items) > 0 {
			trailing.Sections = append(trailing.Sections, sec)
		}
	}
	loose := NavSection{Title: trailingGroupTitle}
	for _, i := range sortedByOrder(docsIn, byFolder[""]) {
		d := docsIn[i]
		if d.Slug != IndexSlug && d.Visibility == Public {
			loose.Items = append(loose.Items, NavItem{Type: NavPage, Slug: d.Slug, Title: d.Title, Status: d.Status})
		}
	}
	if len(loose.Items) > 0 {
		trailing.Sections = append(trailing.Sections, loose)
	}
	if len(trailing.Sections) > 0 {
		nav.Groups = append(nav.Groups, trailing)
	}
	return nav, nil
}

// compileSection orders one folder's public pages per its meta.json: listed
// pages (and separators) first in the listed order, then any unlisted pages by
// frontmatter order and title.
func compileSection(folder, metaPath string, meta SectionMeta, docsIn []Doc, idxs []int) (NavSection, error) {
	byLeaf := make(map[string]int, len(idxs))
	for _, i := range idxs {
		byLeaf[leafOf(docsIn[i].Slug)] = i
	}

	sec := NavSection{Folder: folder, Title: strings.TrimSpace(meta.Title), Items: []NavItem{}}
	listed := map[string]bool{}
	for _, entry := range meta.Pages {
		entry = strings.TrimSpace(entry)
		if label, ok := separatorLabel(entry); ok {
			sec.Items = append(sec.Items, NavItem{Type: NavSeparator, Title: label})
			continue
		}
		if strings.HasPrefix(entry, "---") {
			return NavSection{}, fmt.Errorf("%s: %q is not a valid separator (use \"---Label---\")", metaPath, entry)
		}
		i, ok := byLeaf[entry]
		if !ok {
			return NavSection{}, fmt.Errorf("%s: lists page %q, but %s/%s.mdx does not exist (or has no title)", metaPath, entry, folder, entry)
		}
		if listed[entry] {
			return NavSection{}, fmt.Errorf("%s: page %q is listed more than once", metaPath, entry)
		}
		listed[entry] = true
		if d := docsIn[i]; d.Visibility == Public {
			sec.Items = append(sec.Items, NavItem{Type: NavPage, Slug: d.Slug, Title: d.Title, Status: d.Status})
		}
	}
	for _, i := range sortedByOrder(docsIn, idxs) {
		d := docsIn[i]
		if listed[leafOf(d.Slug)] || d.Visibility != Public {
			continue
		}
		sec.Items = append(sec.Items, NavItem{Type: NavPage, Slug: d.Slug, Title: d.Title, Status: d.Status})
	}
	// A section whose public pages are all hidden has nothing to show; drop any
	// separators left dangling so it reads as empty.
	hasPage := false
	for _, it := range sec.Items {
		if it.Type == NavPage {
			hasPage = true
			break
		}
	}
	if !hasPage {
		sec.Items = nil
	}
	return sec, nil
}

// sectionTitleFallback picks a section label for a folder without a meta.json
// title: the first page's frontmatter `section` (docs already default it to the
// humanized immediate parent), else the humanized folder name.
func sectionTitleFallback(folder string, docsIn []Doc, idxs []int) string {
	for _, i := range sortedByOrder(docsIn, idxs) {
		d := docsIn[i]
		// Only a top-level page's section speaks for the folder; nested pages
		// default to their own subfolder's name.
		if strings.Count(d.Slug, "/") == 1 && d.Section != "" {
			return d.Section
		}
	}
	return humanize(folder)
}

// sortedByOrder returns idxs sorted by frontmatter order, then title, then slug.
func sortedByOrder(docsIn []Doc, idxs []int) []int {
	out := append([]int(nil), idxs...)
	sort.SliceStable(out, func(a, b int) bool {
		x, y := docsIn[out[a]], docsIn[out[b]]
		if x.Order != y.Order {
			return x.Order < y.Order
		}
		if x.Title != y.Title {
			return x.Title < y.Title
		}
		return x.Slug < y.Slug
	})
	return out
}
