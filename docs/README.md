# Flagon documentation

This is the **single source of truth** for Flagon's documentation. It lives in the
product repo on purpose: docs change in the same pull request as the code, so a
capability and its docs ship together and can never quietly drift apart.

Nothing here is rendered directly. The docs are compiled into a corpus the API
owns, and everything else is a *client* of that corpus:

```text
docs/**.mdx  ->  make docs  ->  api/internal/docs/corpus.gen.json  (embedded in the API)
                                        |
                                        +--> HTTP: GET /docs, /docs/{slug}, /docs/search   (the website renders these)
                                        +--> Agent tools: search_docs, get_doc             (the in-product AI answers from docs)
                                        +--> MCP: mcp.flagon.io                             (external agents source docs)
```

One corpus, many front doors. See `api/AGENTS.md` for how this fits the golden path.

## Writing a doc

Every doc is a Markdown/MDX file with YAML frontmatter. The fields:

| Field | Required | Meaning |
| --- | --- | --- |
| `title` | yes | Human title. A file with no `title` is ignored (so this README is skipped). |
| `description` | no | One-line summary, weighted heavily in search and shown in listings. |
| `section` | no | Grouping label, and the column a page appears under in the docs site's "All docs" grid. Use a Title-Case display label (e.g. `Platform`, `API`, `Get started`) and keep it identical across a section's pages. Grouping is case-insensitive, but the label is shown verbatim. Defaults to the top-level folder. |
| `visibility` | no | `public` (default) or `internal`. `internal` docs never leave the org: they are excluded from the public HTTP endpoints and the public MCP, but the in-product agent can still read them. |
| `order` | no | Sort order within a section (ascending). Defaults to `0`. |

The **slug** is the path under `docs/` without the extension: `docs/platform/projects.mdx`
is `platform/projects`.

## The rule for what lives here

If changing the code should change the doc in the same PR, the doc lives here,
next to (or with) the feature. Narrative that is not coupled to code can live in
the website. When you add an API operation, add or update its doc here in the
same change: `make docs` regenerates the corpus, and CI fails if you forget
(`go run ./cmd/gendocs -check`).

## Regenerating the corpus

```sh
cd api
go run ./cmd/gendocs        # writes internal/docs/corpus.gen.json
go run ./cmd/gendocs -check # exits non-zero if the committed corpus is stale
```

`make docs` from the repo root does the same.
