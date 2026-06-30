# Flagon design system

The reusable building blocks for every surface (marketing, app, sudo). **Reuse these — do not hand-roll new buttons, inputs, dropdowns, or color values.** Live, rendered catalog at `/sudo/design`. Keep both this file and that page current when you add a primitive.

Styling: Tailwind v4 (CSS-first `@theme` in `globals.css`, `.dark` class), composed with `cva` + `cn()` (`@/lib/cn`). Never hardcode `zinc-*`/hex — use the semantic tokens below.

## Tokens (`globals.css` `@theme`)

| Token | Use |
| --- | --- |
| `brand-400/500/600` | Brand vermilion (`--color-brand-500` = `#ff6a14`). Primary actions, active state, accents. |
| `background` | Page background. |
| `card` / `card-muted` | Raised surfaces; `card-muted` = hover/secondary fill. |
| `border` | All hairline borders + dividers. |
| `foreground` / `muted` | Primary / secondary text. `muted` for labels, hints, inactive nav. |
| `input` | Form control background. |

Semantic status colors: emerald (success), amber (warning), red (danger).

## Primitives (`@/components/ui`)

- **Button** (`button.tsx`) — `<Button variant size>`; `variant=primary|secondary|ghost|danger`, `size=sm|md|lg|icon` (default primary/md). For a link that looks like a button, put `buttonVariants({ variant, size })` as `className` on `<Link>` — don't nest a Button in an anchor.
- **Badge** (`badge.tsx`) — `<Badge variant>`; `variant=neutral|brand|success|warning|danger`. Status pills.
- **Input** (`input.tsx`) — styled `<input>`; spreads all native props (`type`, `disabled`, `placeholder`, `defaultValue`/`value`). Full-width by default.
- **Textarea** (`textarea.tsx`) — multiline counterpart to Input; same styling, spreads native props (`rows`, etc.).
- **Select** (`select.tsx`) — `<Select value onValueChange options ariaLabel className>`; `options: {value,label}[]`. Custom popover listbox (the native `<select>` can't be themed). Use this everywhere instead of `<select>`.
- **Modal** (`modal.tsx`) — `<Modal open onClose title description footer size closeOnEsc closeOnBackdrop showClose>`; portal + blurred backdrop, body-scroll lock, focus trap + restore, ESC/backdrop dismiss (both configurable, default on). On open it focuses the **first form field** (skips the header close button) so you can type immediately; the focus effect keys on `open` only (reads `onClose`/`closeOnEsc` via refs) so typing-induced re-renders never steal focus — don't add `onClose` back to its deps. **Build every create/confirm flow on this.** Pattern: a trigger `Button` flips an `open` state; put the form in `children` with `id`, and a submit `<Button type="submit" form={id}>` in `footer`; close on success. **Footer actions are right-aligned with the primary action rightmost** — order them `Cancel` then primary (the `footer` prop is `flex justify-end`; if you render a footer inside the body instead, match `flex justify-end gap-2 border-t border-border pt-4`).

## Form helpers (`@/components/form`)

- **Field** — `<Field label value onChange type? placeholder? hint? autoComplete?>`. Labeled, controlled Input with optional hint text. `onChange` receives the string value.
- **SubmitButton** — `<SubmitButton loading>` full-width submit with disabled-while-loading.

## Overlay / menu pattern

One shared pattern: a trigger button with `aria-haspopup` + an absolutely-positioned panel, closed on click-outside and Escape. Implemented by `Select`, `ThemeToggle` (`@/components/theme-toggle`), `UserMenu` (`@/components/app/user-menu`, account menu, top-right), and `OrgSwitcher` (`@/components/org-switcher`, sidebar header, org logo with Flagon fallback). **Copy one of these as the basis for any new dropdown.**

## App chrome (`@/components/app`)

- **AppShell** — fixed sidebar (org/brand header + grouped nav + bottom collapse) beside a column with a slim top header (account menu top-right) over scrolling content. Used by the dashboard (org switcher header) and sudo (brand + badge header). On mobile the sidebar is hidden (`md:`) and replaced by **MobileNav** (`@/components/app/mobile-nav`) — a hamburger in the topbar opens a portal slide-in drawer reusing the same `SidebarHeaderContent`/`SidebarNav`/`SidebarFooter` (so the org switcher works on mobile). The marketing nav has its own **MarketingMobileMenu** for the same reason.
- **AppSidebar** — takes serializable `NavSection[]` (`icon` is a string key in the `ICONS` registry); add an icon to the registry to use it. `soon: true` renders a muted "Soon" item (no link).
- **AppTopbar** — slim header; optional `left` slot (brand for standalone pages), theme toggle + `UserMenu` on the right.

## Icons

`lucide-react` for UI; `@icons-pack/react-simple-icons` for brand logos (GitHub/Google/Apple). Loading states use `<Skeleton>` (`@/components/skeleton`) — never spinners or "Loading…".
