# flagon.io

The [Flagon, Inc.](https://www.flagon.io) company site, built in the open.
Flagon is the company; the products it builds (starting with
[g1t](https://g1t.sh)) each have their own site. One Next.js app holds the
company pages, the products portfolio, the public [handbook](https://www.flagon.io/handbook),
and the [blog](https://www.flagon.io/blog). The content is Markdown/MDX you can
read, edit, and send a pull request against, and it all lives in this repo.

## Quick start

```bash
npm install
npm run dev      # http://localhost:3001
```

Node 24 (see [`.nvmrc`](.nvmrc) and the `engines` field in `package.json`).

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint
npm run typecheck
```

## What's in here

- **Company site**: home, about, careers, people, teams, and the rest of the public pages.
- **Products** (`/products`): the portfolio. Each product is one entry in [`src/lib/products.ts`](src/lib/products.ts) and links out to its own site.
- **The handbook** (`/handbook`): the company's operating manual and source of truth, around 90 MDX pages, including the brand guidelines (`/brand` redirects into it).
- **The blog** (`/blog`).

## Project structure

```text
content/
  handbook/          # the company handbook: <folder>/<slug>.mdx, flat URLs
  blog/              # blog posts, one .mdx per post
src/
  app/               # routes (home, /about, /products, /handbook, /blog, ...)
  brand/             # the Flagon mark (SVG component)
  components/        # site chrome and MDX rendering
  lib/               # content loaders and config (handbook.ts, blog.ts, products.ts, site.ts)
```

## Authoring content

### A handbook page

Create `content/handbook/<folder>/<slug>.mdx`. Folders only group source files
by department; the URL is always `/handbook/<slug>`, so slugs must be unique
across folders.

```mdx
---
title: How we work
description: The way we operate, day to day.
section: How we work
order: 1
---

Body goes here. Use `##` and `###` headings; the page renders its own H1.

<Callout type="brand" title="A pull-quote or aside">
  Callouts (type: brand | note | warn) are available in MDX without importing them.
</Callout>
```

Pages are grouped and ordered by the `section` and `order` fields. The section
order itself, and which sections are collapsible or marked "soon", lives in
[`src/lib/handbook.ts`](src/lib/handbook.ts). Only the `Chapters` section is numbered.

### A blog post

Create `content/blog/<slug>.mdx`:

```mdx
---
title: Starting Flagon
description: Why we're doing this, and doing it in the open.
date: 2026-06-15
author: Chase Pierce
role: Founder
tags: [company]
---

Body goes here.
```

Posts are sorted newest-first by `date`.

### Two things that will bite you

- **Quote any frontmatter value containing a colon-space.** `description: How we work: the details` breaks the YAML parse and the page loses its title, section, and order. Wrap it in double quotes: `description: "How we work: the details"`.
- **No em dashes or en dashes in prose.** House style uses commas, colons, and periods instead. Write in the present tense, as a company that exists and does what it says. The full voice is in the handbook's brand pages (`/handbook/brand-voice`).

New content files are read from disk, so the dev server may need a restart to
pick up a brand-new `.mdx` file in the handbook nav (edits to existing files
hot-reload fine).

## Theming

Dark mode is class-based: a `.dark` class on `<html>`, set before first paint by
an inline script so there is no flash. Design tokens and the brand palette are
tokens in [`src/app/globals.css`](src/app/globals.css). The Flagon mark and the
theme are self-contained, so there are no private packages and nothing to
install beyond what is in `package.json`.

## Stack

- [Next.js](https://nextjs.org) (App Router) + React
- [Tailwind CSS v4](https://tailwindcss.com)
- MDX via [`next-mdx-remote`](https://github.com/hashicorp/next-mdx-remote) with
  `remark-gfm`, slugged and linkable headings, and Shiki code highlighting

## Deploy

It is a standard Next.js App Router app and deploys to Vercel (or any Node 24
host) with `npm run build`. There is no bespoke build step.

## License

MIT, see [LICENSE](LICENSE). The words are ours; the code is yours to learn from.
