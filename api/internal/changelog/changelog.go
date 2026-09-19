// Package changelog owns Flagon's public changelog: the compiled form of the
// top-level changelog/ tree. The log is generated from source by cmd/genchangelog
// (make changelog) into changelog.gen.json and embedded into the API binary, so
// the changelog ships and deploys atomically with the code it records.
//
// It is the downstream end of the roadmap lifecycle: an item that reaches general
// availability leaves internal/roadmap's board and is recorded here. The website
// renders its /changelog page entirely from the /changelog endpoint this backs,
// holding no copy, so it can never drift. Mirrors internal/docs and
// internal/roadmap.
package changelog

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sort"
)

// Entry is one dated changelog note.
type Entry struct {
	Slug  string `json:"slug"`
	Title string `json:"title"`
	// Date is an ISO date (YYYY-MM-DD). It sorts lexically, which is also
	// chronologically, so no time parsing is needed to order the log.
	Date string `json:"date"`
	// Tag is an optional short badge, e.g. "Shipped", "New", "Improved", "Fixed".
	Tag string `json:"tag,omitempty"`
	// Area is an optional grouping, e.g. "Platform", "UI", "API".
	Area string `json:"area,omitempty"`
	// Body is the Markdown note.
	Body string `json:"body"`
}

// Corpus is the serialized changelog (the shape of changelog.gen.json).
type Corpus struct {
	Entries []Entry `json:"entries"`
}

//go:embed changelog.gen.json
var corpusJSON []byte

// Load parses the embedded corpus into a ready-to-serve Log. It is called once at
// startup; a malformed corpus is a build-time mistake, so it errors loudly.
func Load() (*Log, error) {
	var c Corpus
	if err := json.Unmarshal(corpusJSON, &c); err != nil {
		return nil, fmt.Errorf("parse embedded changelog corpus: %w", err)
	}
	return New(c), nil
}

// Log is an in-memory, read-only view of the changelog. It is safe for concurrent
// use after construction.
type Log struct {
	entries []Entry
}

// New builds a Log from a Corpus, sorting entries newest first (by date, then
// slug for a stable order among same-day entries).
func New(c Corpus) *Log {
	entries := make([]Entry, len(c.Entries))
	copy(entries, c.Entries)
	sort.SliceStable(entries, func(i, j int) bool {
		a, b := entries[i], entries[j]
		if a.Date != b.Date {
			return a.Date > b.Date // newest first
		}
		return a.Slug < b.Slug
	})
	return &Log{entries: entries}
}

// Entries returns every changelog entry, newest first.
func (l *Log) Entries() []Entry { return l.entries }
