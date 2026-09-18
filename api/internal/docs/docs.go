// Package docs owns Flagon's documentation corpus: the compiled, searchable form
// of the top-level docs/ tree. The corpus is generated from source by
// cmd/gendocs (make docs) into corpus.gen.json and embedded into the API binary,
// so documentation ships and deploys atomically with the code it describes.
//
// One corpus, many front doors: the same Index backs the public HTTP endpoints
// (which the website renders), the in-product agent's search_docs/get_doc tools,
// and the public MCP server. Retrieval is a static-index problem, not an
// inference one - searching costs a map lookup, never a model call.
package docs

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// Visibility controls how far a doc travels. Public docs are served everywhere;
// internal docs stay inside the organization boundary: excluded from the public
// HTTP endpoints and the public MCP, but readable by the in-product agent.
type Visibility string

const (
	Public   Visibility = "public"
	Internal Visibility = "internal"
)

// Doc is one documentation page, including its full body.
type Doc struct {
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	Section     string     `json:"section,omitempty"`
	Visibility  Visibility `json:"visibility"`
	Order       int        `json:"order,omitempty"`
	Headings    []string   `json:"headings,omitempty"`
	Body        string     `json:"body"`
}

// Meta is a Doc without its body: the shape used for listings and search results,
// so callers that only need to browse never pay to move full pages around.
type Meta struct {
	Slug        string     `json:"slug"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	Section     string     `json:"section,omitempty"`
	Visibility  Visibility `json:"visibility"`
	Order       int        `json:"order,omitempty"`
}

// Meta strips the body off a Doc.
func (d Doc) Meta() Meta {
	return Meta{
		Slug:        d.Slug,
		Title:       d.Title,
		Description: d.Description,
		Section:     d.Section,
		Visibility:  d.Visibility,
		Order:       d.Order,
	}
}

// Corpus is the serialized set of docs (the shape of corpus.gen.json).
type Corpus struct {
	Docs []Doc `json:"docs"`
}

//go:embed corpus.gen.json
var corpusJSON []byte

// Load parses the embedded corpus into a ready-to-query Index. It is called once
// at startup; a malformed corpus is a build-time mistake, so it errors loudly.
func Load() (*Index, error) {
	var c Corpus
	if err := json.Unmarshal(corpusJSON, &c); err != nil {
		return nil, fmt.Errorf("parse embedded docs corpus: %w", err)
	}
	return NewIndex(c), nil
}

// Field weights for scoring. A term in the title or description signals topic far
// more strongly than the same term buried in the body.
const (
	weightTitle       = 8.0
	weightDescription = 4.0
	weightHeading     = 4.0
	weightBody        = 1.0
)

// Index is an in-memory, read-only search index over the corpus. It is safe for
// concurrent use after construction.
type Index struct {
	bySlug map[string]Doc
	order  []string                      // slugs, stable (section, order, title)
	terms  map[string]map[string]float64 // slug -> term -> accumulated weight
}

// NewIndex precomputes per-doc term weights so queries are cheap.
func NewIndex(c Corpus) *Index {
	idx := &Index{
		bySlug: make(map[string]Doc, len(c.Docs)),
		terms:  make(map[string]map[string]float64, len(c.Docs)),
	}
	for _, d := range c.Docs {
		if d.Visibility == "" {
			d.Visibility = Public
		}
		idx.bySlug[d.Slug] = d
		idx.order = append(idx.order, d.Slug)

		tw := map[string]float64{}
		addTerms(tw, d.Title, weightTitle)
		addTerms(tw, d.Description, weightDescription)
		for _, h := range d.Headings {
			addTerms(tw, h, weightHeading)
		}
		addTerms(tw, d.Body, weightBody)
		idx.terms[d.Slug] = tw
	}
	sort.SliceStable(idx.order, func(i, j int) bool {
		a, b := idx.bySlug[idx.order[i]], idx.bySlug[idx.order[j]]
		if a.Section != b.Section {
			return a.Section < b.Section
		}
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return a.Title < b.Title
	})
	return idx
}

// Get returns one doc by slug. A doc is withheld if it is internal and the caller
// did not opt in to internal visibility.
func (idx *Index) Get(slug string, includeInternal bool) (Doc, bool) {
	d, ok := idx.bySlug[slug]
	if !ok {
		return Doc{}, false
	}
	if d.Visibility == Internal && !includeInternal {
		return Doc{}, false
	}
	return d, true
}

// List returns doc metadata in stable (section, order, title) order, filtered by
// visibility.
func (idx *Index) List(includeInternal bool) []Meta {
	out := make([]Meta, 0, len(idx.order))
	for _, slug := range idx.order {
		d := idx.bySlug[slug]
		if d.Visibility == Internal && !includeInternal {
			continue
		}
		out = append(out, d.Meta())
	}
	return out
}

// Hit is one search result: the matched doc's metadata, a relevance score, and a
// short snippet showing why it matched.
type Hit struct {
	Doc     Meta    `json:"doc"`
	Score   float64 `json:"score"`
	Snippet string  `json:"snippet"`
}

// Search ranks docs against a free-text query, honoring visibility. Scoring is a
// weighted term match: every distinct query term contributes a doc's accumulated
// weight for that term. limit <= 0 returns all matches.
func (idx *Index) Search(query string, includeInternal bool, limit int) []Hit {
	terms := dedupe(tokenize(query))
	if len(terms) == 0 {
		return nil
	}
	var hits []Hit
	for _, slug := range idx.order {
		d := idx.bySlug[slug]
		if d.Visibility == Internal && !includeInternal {
			continue
		}
		tw := idx.terms[slug]
		var score float64
		for _, t := range terms {
			score += tw[t]
		}
		if score <= 0 {
			continue
		}
		hits = append(hits, Hit{Doc: d.Meta(), Score: score, Snippet: snippet(d, terms)})
	}
	sort.SliceStable(hits, func(i, j int) bool {
		if hits[i].Score != hits[j].Score {
			return hits[i].Score > hits[j].Score
		}
		return hits[i].Doc.Slug < hits[j].Doc.Slug
	})
	if limit > 0 && len(hits) > limit {
		hits = hits[:limit]
	}
	return hits
}

// addTerms accumulates each token's weight into tw. Distinct terms matter more
// than raw frequency here, so we count each occurrence but cap runaway repetition
// by simple summation, which is adequate for a small hand-written corpus.
func addTerms(tw map[string]float64, text string, weight float64) {
	for _, t := range tokenize(text) {
		tw[t] += weight
	}
}

// tokenize lowercases and splits on any non-alphanumeric run, dropping
// single-character tokens (noise).
func tokenize(s string) []string {
	fields := strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
		return !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9')
	})
	out := fields[:0]
	for _, f := range fields {
		if len(f) >= 2 {
			out = append(out, f)
		}
	}
	return out
}

// snippet returns a short window of the body around the first query-term match,
// falling back to the description or the body's head.
func snippet(d Doc, terms []string) string {
	const width = 180
	body := strings.Join(strings.Fields(d.Body), " ")
	lower := strings.ToLower(body)
	best := -1
	for _, t := range terms {
		if i := strings.Index(lower, t); i >= 0 && (best < 0 || i < best) {
			best = i
		}
	}
	if best < 0 {
		if d.Description != "" {
			return d.Description
		}
		return truncate(body, width)
	}
	start := best - width/3
	if start < 0 {
		start = 0
	}
	out := body[start:]
	if start > 0 {
		out = "..." + out
	}
	return truncate(out, width)
}

// dedupe returns the distinct terms, preserving first-seen order.
func dedupe(terms []string) []string {
	seen := make(map[string]bool, len(terms))
	out := terms[:0]
	for _, t := range terms {
		if seen[t] {
			continue
		}
		seen[t] = true
		out = append(out, t)
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	cut := s[:n]
	if i := strings.LastIndex(cut, " "); i > n/2 {
		cut = cut[:i]
	}
	return cut + "..."
}
