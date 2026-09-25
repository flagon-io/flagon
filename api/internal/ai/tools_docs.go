package ai

import (
	"context"
	"fmt"

	"github.com/flagon-io/flagon/api/internal/service"
)

// registerDocsTools adds the read-only documentation retrieval tools. They are
// Public: safe on the unauthenticated MCP front door, because they touch no
// tenant data and never mutate. Internal docs are gated on tc.AllowInternalDocs,
// which the front door sets only for authenticated callers (the assistant and
// the authenticated MCP), so they never leak to the anonymous MCP.
// They front the plain /docs routes (not API operations), so they carry no
// Operation.
func registerDocsTools(r *Registry, idx DocsIndex) {
	type searchInput struct {
		Query string `json:"query" tool:"required"`
		Limit int    `json:"limit"`
	}
	r.add(Tool{
		Public: true,
		Def: ToolDef{
			Name:        "search_docs",
			Description: "Search Flagon's documentation and company handbook. Use this to answer questions about how Flagon works, its API, and how the company operates. Returns ranked matches with a slug, title, and snippet; call get_doc to read the full page.",
			InputSchema: schema(`{"type":"object","properties":{"query":{"type":"string","description":"What to search for"},"limit":{"type":"integer","description":"Max results (default 5)"}},"required":["query"],"additionalProperties":false}`),
		},
		Run: run(func(_ context.Context, tc ToolContext, in searchInput) (any, error) {
			limit := in.Limit
			if limit <= 0 {
				limit = 5
			}
			return map[string]any{"results": idx.Search(in.Query, tc.AllowInternalDocs, limit)}, nil
		}),
	})

	type getInput struct {
		Slug string `json:"slug"`
	}
	r.add(Tool{
		Public: true,
		Def: ToolDef{
			Name:        "get_doc",
			Description: "Read one Flagon documentation page in full by its slug (e.g. \"platform/projects\"), as returned by search_docs.",
			InputSchema: schema(`{"type":"object","properties":{"slug":{"type":"string","description":"The doc slug, e.g. platform/projects"}},"required":["slug"],"additionalProperties":false}`),
		},
		Run: run(func(_ context.Context, tc ToolContext, in getInput) (any, error) {
			doc, found := idx.Get(in.Slug, tc.AllowInternalDocs)
			if !found {
				return nil, service.NotFound(fmt.Sprintf("no such doc: %q", in.Slug))
			}
			return map[string]any{"doc": doc}, nil
		}),
	})
}
