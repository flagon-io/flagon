<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Documentation site (docs.flagon.io)

The customer-facing docs: guides and reference for the feature-flags product,
built on the same `@flagon/design` system as the other apps.

- **Content is MDX.** A page is `src/app/<route>/page.mdx`. Add it to the sidebar
  in `src/lib/nav.ts` (the flat order also drives prev/next paging). Export a
  `metadata` object from each page for the `<title>` and description.
- **Prose styling lives in `src/mdx-components.tsx`**, not in each page. That
  mapping turns Markdown elements into the design-system voice and exposes the
  custom components (`Callout`, `CodeTabs`, `CodeBlock`) so MDX can use them
  without importing. Restyle there, once.
- **The MDX pipeline is plugin-free** (no remark/rehype) so it builds cleanly
  under Turbopack. Code highlighting is presentational via `CodeBlock`, not a
  build-time highlighter. Keep it that way unless you verify a plugin builds.
- **Get the API details right.** Code samples must match the real API: OFREP
  endpoints under `/ofrep/v1/evaluate/flags`, SDK-key bearer auth, the
  management surface under `/v1/orgs/{org}`. When in doubt, read `apps/api`.
- **No brand-icon library.** Lucide dropped brand glyphs; the one brand mark used
  here (`IconGitHub`) comes from `@flagon/design`. If more are needed, add them
  to the design system, don't add a per-app icon dependency.
