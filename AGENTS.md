<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Commits

**Do not `git commit` or `git push`.** The maintainer commits all work
themselves. Make and verify changes, keep `PROJECT.md` current, and leave the
working tree for them.

## Design system

Before building any UI, read [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) and reuse the existing primitives (Button, Badge, Input, Select, Field, the menu pattern, AppShell). Don't hand-roll buttons/inputs/dropdowns or hardcode colors — use the tokens. Live catalog at `/sudo/design`; keep both updated when you add a component.
