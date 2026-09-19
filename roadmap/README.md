# Roadmap

This directory is the source of truth for the public roadmap shown at
`flagon.io/roadmap`. The work lives here, in the same repo as the code it
describes, so the roadmap moves when the work moves, not when someone remembers
to update the website.

Each item is one Markdown file with frontmatter:

```mdx
---
title: The Flagon platform
stage: concept        # concept | alpha | beta
team: Engineering     # the team that owns it (also the board's filter)
tag: Foundation       # optional short badge
order: 1              # optional; lower sorts first within a stage
---

The prose paragraph(s) here become the item's summary, shown when a card opens.

- Bullet points become the "what it covers" list
- Add or remove them freely
```

## Workflow

- **Add an item:** create a new `.mdx` file.
- **Move an item as it matures:** change its `stage` (`concept` -> `alpha` -> `beta`).
- **Hand it to another team:** change its `team`.
- **Ship it:** an item that reaches general availability leaves the board for the
  changelog, so delete the file (and record the ship in the changelog).

After editing anything here, run `make roadmap` from the repo root and commit the
regenerated `api/internal/roadmap/roadmap.gen.json`. CI runs `make roadmap-check`
and fails if the corpus is stale, so the roadmap and the code can never diverge
on `main`.

## How it is served

`cmd/genroadmap` compiles this tree into `api/internal/roadmap/roadmap.gen.json`,
which is embedded into the API binary and served at `GET /roadmap`. The website
renders its `/roadmap` page entirely from that endpoint: it holds no copy of this
data, so it can never drift, and it degrades gracefully when the API is
unreachable. This mirrors how `docs/` is owned and served (see `internal/docs`).
