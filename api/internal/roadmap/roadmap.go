// Package roadmap owns Flagon's public roadmap: the compiled form of the
// top-level roadmap/ tree. The board is generated from source by cmd/genroadmap
// (make roadmap) into roadmap.gen.json and embedded into the API binary, so the
// roadmap ships and deploys atomically with the code it describes.
//
// The website renders its /roadmap page entirely from the /roadmap endpoint this
// backs, holding no copy of the data, so it can never drift from what the API
// actually has. This mirrors how internal/docs owns the documentation corpus.
package roadmap

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"sort"
)

// Stage is an item's lifecycle position. Items flow left to right as they
// mature: concept -> alpha -> beta. Anything that reaches general availability
// leaves the board for the changelog, so there is deliberately no "done" stage.
type Stage string

const (
	Concept Stage = "concept"
	Alpha   Stage = "alpha"
	Beta    Stage = "beta"
)

// stageRank orders the stages for display and sorting. An unknown stage sorts
// last (it is a build-time error anyway; see build.go).
var stageRank = map[Stage]int{Concept: 0, Alpha: 1, Beta: 2}

// Valid reports whether s is a known stage.
func (s Stage) Valid() bool { _, ok := stageRank[s]; return ok }

// StageInfo describes a stage for the board's columns. It travels with the
// payload so the website never hard-codes the labels or their order.
type StageInfo struct {
	Stage Stage  `json:"stage"`
	Label string `json:"label"`
	Blurb string `json:"blurb"`
}

// stages is the fixed set of columns, in board order.
var stages = []StageInfo{
	{Concept, "Concept", "Committed to building, still taking shape."},
	{Alpha, "Alpha", "An early build, rough and moving fast."},
	{Beta, "Beta", "Ready to try, close to done."},
}

// Item is one thing on the roadmap.
type Item struct {
	Slug     string   `json:"slug"`
	Title    string   `json:"title"`
	Stage    Stage    `json:"stage"`
	Team     string   `json:"team"`
	Tag      string   `json:"tag,omitempty"`
	Summary  string   `json:"summary,omitempty"`
	Includes []string `json:"includes,omitempty"`
	Order    int      `json:"order,omitempty"`
}

// Corpus is the serialized roadmap (the shape of roadmap.gen.json).
type Corpus struct {
	Items []Item `json:"items"`
}

//go:embed roadmap.gen.json
var corpusJSON []byte

// Load parses the embedded corpus into a ready-to-serve Board. It is called once
// at startup; a malformed corpus is a build-time mistake, so it errors loudly.
func Load() (*Board, error) {
	var c Corpus
	if err := json.Unmarshal(corpusJSON, &c); err != nil {
		return nil, fmt.Errorf("parse embedded roadmap corpus: %w", err)
	}
	return New(c), nil
}

// Board is an in-memory, read-only view of the roadmap. It is safe for
// concurrent use after construction.
type Board struct {
	items []Item
}

// New builds a Board from a Corpus, sorting items into stable board order:
// stage (concept, alpha, beta), then the item's own order, then title.
func New(c Corpus) *Board {
	items := make([]Item, len(c.Items))
	copy(items, c.Items)
	sort.SliceStable(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if stageRank[a.Stage] != stageRank[b.Stage] {
			return stageRank[a.Stage] < stageRank[b.Stage]
		}
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		return a.Title < b.Title
	})
	return &Board{items: items}
}

// Items returns every roadmap item in board order.
func (b *Board) Items() []Item { return b.items }

// Stages returns the stage columns in board order.
func (b *Board) Stages() []StageInfo { return stages }

// Teams returns the distinct teams present on the board, sorted, for the filter.
func (b *Board) Teams() []string {
	seen := map[string]bool{}
	var out []string
	for _, it := range b.items {
		if it.Team != "" && !seen[it.Team] {
			seen[it.Team] = true
			out = append(out, it.Team)
		}
	}
	sort.Strings(out)
	return out
}
