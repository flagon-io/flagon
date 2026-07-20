# Flagon UI

The design system. Deliberately self-contained (own directory, no imports
from `src/app` or `src/lib` beyond React/Radix) so it can graduate to a
standalone repository/package later without surgery.

Conventions:

- **Radix-first**: wherever a Radix primitive exists (labels, dialogs,
  dropdowns, tooltips, ...), wrap it here rather than reinventing behavior.
  We own the styling; Radix owns the accessibility and interactions.
- Dark theme, teal accent, matching `src/lib/brand.ts` colors.
- Components take plain props; no app-specific concepts (plans, orgs, auth)
  ever appear in here.

Migration note: older primitives still live in `src/components/form-ui.tsx`
(class-string based). New components land here; existing ones migrate over
as they're touched. Import via `@/ui`.
