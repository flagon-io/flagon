# Flagon documentation

This is the **single source of truth** for Flagon's documentation. It lives in the
product repo on purpose: docs change in the same pull request as the code, so a
capability and its docs ship together and can never quietly drift apart.

Nothing here is rendered directly. The docs are compiled into a corpus the API
owns, and everything else is a *client* of that corpus:

```text
docs/**.mdx  ->  make docs  ->  api/internal/docs/corpus.gen.json  (embedded in the API)
                                        |
                                        +--> HTTP: GET /docs, /docs/page, /docs/search, /docs/nav   (the website renders these)
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
| `section` | no | Section label. A folder's `meta.json` `title` wins over this (see Navigation). Without one, it **defaults to a humanized version of the page's immediate parent directory** (`get-started/` → `Get started`, `api/` → `API`, `handbook/hiring/` → `Hiring`). Only set it when the folder name isn't the label you want and the folder has no `meta.json` title (e.g. the handbook's `Pay & perks`). |
| `status` | no | `published` (default) or `planned`. A `planned` page is a placeholder: it shows in the nav and grid so the structure is visible, but renders a "not written yet" state instead of an empty article. Give it a `title` and `description` and leave the body empty until you write it. |
| `visibility` | no | `public` (default) or `internal`. `internal` docs never leave the org: they are excluded from the public HTTP endpoints and the public MCP, but the in-product agent can still read them. |
| `order` | no | Sort order (ascending, default `0`) for pages a folder's `meta.json` does not list, and for surfaces without one (the handbook). Prefer listing pages in `meta.json`. |

The **slug** (a page's URL) is `<top-level-section>/<filename>`, without the
extension. **Intermediate directories are dropped**, so you can group pages into
category subfolders for tidiness without changing their URLs:
`docs/get-started/quickstart.mdx` is `get-started/quickstart`, and
`docs/handbook/how-we-work/communication.mdx` is still `handbook/communication`.
Leaf filenames must therefore be unique within a top-level section (`make docs`
fails on a collision).

The landing page is `docs/index.mdx` (slug `index`), which the website renders
at `/docs`. It is the only root-level page; everything else lives in a folder.

## Navigation: meta.json

The sidebar, the reading order (previous/next), and the order of `GET /docs`
all come from `meta.json` files, compiled into the corpus and served at
`GET /docs/nav`. Two kinds:

**`docs/meta.json`** (root) orders the top-level folders into labeled groups:

```json
{
  "groups": [
    { "title": "Get started", "sections": ["get-started"] },
    { "title": "Build and operate", "sections": ["guides", "platform", "ai"] }
  ],
  "exclude": ["handbook"]
}
```

- `groups` render in order, each with its folders (sections) in order.
- `exclude` lists folders with their own surface (the handbook). Their pages
  stay in the corpus (readable by slug, searchable) but never appear in the nav.
- A folder no group lists and that is not excluded still appears, in a trailing
  `More` group, so a new folder is never invisible.

**`docs/<folder>/meta.json`** sets the section's title and page order:

```json
{
  "title": "Guides",
  "pages": [
    "---Set up your organization---",
    "create-an-organization",
    "invite-your-team",
    "---Work with projects---",
    "create-a-project"
  ]
}
```

- `pages` lists leaf filenames without the extension, in reading order (the
  filename even when the page sits in a subfolder, since the slug drops it).
- A `---Label---` entry is a separator: it starts a labeled sub-group within
  the section.
- Pages you do not list are appended at the end (by `order`, then title), so a
  forgotten page still shows up.
- The section label is the `title` here, else the pages' `section`
  frontmatter, else the humanized folder name.

These are **build errors** (`make docs` and `go test` fail): listing a page that
does not exist, listing a page twice, a group naming a folder that does not
exist, a folder in two groups, and any unknown field (a typo like `"page"` for
`"pages"` is caught, not ignored). Create the page, even as a `status: planned`
stub, before you list it. Internal pages never appear in the nav.

`GET /docs/nav` returns:

```json
{
  "nav": {
    "index": { "type": "page", "slug": "index", "title": "Flagon documentation" },
    "groups": [
      {
        "title": "Build and operate",
        "sections": [
          {
            "folder": "guides",
            "title": "Guides",
            "items": [
              { "type": "separator", "title": "Set up your organization" },
              { "type": "page", "slug": "guides/create-an-organization", "title": "Create an organization" },
              { "type": "page", "slug": "guides/set-up-sso-saml", "title": "Set up SSO with SAML", "status": "planned" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Components

Pages are MDX, rendered by the website. Only these components exist; any other
JSX tag fails to render. Leave a blank line between a JSX tag and the markdown
inside it.

| Component | Usage |
| --- | --- |
| `Callout` | `<Callout type="note" title="Optional title">markdown</Callout>`. `type` is `note` (default), `info`, `tip`, `warn`, `danger`, or `brand`. |
| `Cards`, `Card` | `<Cards>` wrapping self-closing `<Card title="..." href="/docs/..." description="..." />`. A grid of linked cards, two columns on wide screens. |
| `Steps`, `Step` | `<Steps>` wrapping `<Step title="...">markdown</Step>`. Numbered, vertical. |
| `Tabs`, `Tab` | `<Tabs>` wrapping `<Tab title="...">markdown</Tab>`. Feature pages use tabs titled `Dashboard`, `API`, and `Assistant`. |

Plus GFM markdown: tables, task lists, and fenced code with a language (`bash`,
`json`, `ts`, `go`, `sql`, `yaml`, `http`). Diagrams are a fenced block with
language `text` drawn with Unicode box drawing (`─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼`) and
arrows (`▼ ▲ ► ◄`), at most 78 columns, single-width characters only (no emoji,
no tabs). They render in a monospace face without ligatures or wrapping, so
count columns: a ragged box looks broken.

In prose, a bare `{`, `}`, or `<` breaks MDX: put code-ish text in backticks.
HTML comments are not allowed.

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
