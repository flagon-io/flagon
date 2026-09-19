# Changelog

This directory is the source of truth for the public changelog shown at
`flagon.io/changelog`. Like the docs and the roadmap, it lives in the same repo
as the code it describes, so an entry ships in the same change as the work it
records and can never drift from what the website shows.

It is the downstream end of the roadmap lifecycle: an item that reaches general
availability leaves the board in `roadmap/` and is recorded here.

Each entry is one Markdown file with frontmatter:

```mdx
---
title: What shipped, in one line
date: 2026-09-19        # YYYY-MM-DD; entries are shown newest first
tag: Shipped            # optional short badge: Shipped | New | Improved | Fixed
area: Platform          # optional grouping: Platform | UI | API | Docs | ...
---

The note. Plain Markdown: a paragraph or two on what changed and why it matters.
Bullet lists, links, and code all render.
```

Name files `YYYY-MM-DD-slug.md` so they sort naturally on disk and the slug (the
filename) makes a stable anchor link. The `date` frontmatter is what the site
actually sorts by.

## Workflow

- **Record a ship:** add a new `.md` file with today's `date`.
- After editing anything here, run `make changelog` from the repo root and commit
  the regenerated `api/internal/changelog/changelog.gen.json`. CI runs
  `make changelog-check` and fails if the corpus is stale.

## How it is served

`cmd/genchangelog` compiles this tree into
`api/internal/changelog/changelog.gen.json`, which is embedded into the API
binary and served at `GET /changelog`. The website renders its `/changelog` page
entirely from that endpoint: it holds no copy, cannot drift, and degrades
gracefully when the API is unreachable. This mirrors how `docs/` and `roadmap/`
are owned and served (see `internal/docs`, `internal/roadmap`).
