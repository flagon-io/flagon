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
| `section` | no | Grouping label, and the column a page appears under in the docs site's "All docs" grid. **Defaults to a humanized version of the page's immediate parent directory** (`get-started/` → `Get started`, `api/` → `API`, `handbook/hiring/` → `Hiring`), so the folder is the category unless you set this. Only override when the folder name isn't the label you want (e.g. `Pay & perks`). Grouping is case-insensitive. |
| `status` | no | `published` (default) or `planned`. A `planned` page is a placeholder: it shows in the nav and grid so the structure is visible, but renders a "not written yet" state instead of an empty article. Give it a `title` and `description` and leave the body empty until you write it. |
| `visibility` | no | `public` (default) or `internal`. `internal` docs never leave the org: they are excluded from the public HTTP endpoints and the public MCP, but the in-product agent can still read them. |
| `order` | no | Sort order within a section (ascending). Defaults to `0`. |

The **slug** (a page's URL) is `<top-level-section>/<filename>`, without the
extension. **Intermediate directories are dropped**, so you can group pages into
category subfolders for tidiness without changing their URLs:
`docs/get-started/quickstart.mdx` is `get-started/quickstart`, and
`docs/handbook/how-we-work/communication.mdx` is still `handbook/communication`.
Leaf filenames must therefore be unique within a top-level section (`make docs`
fails on a collision).

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
