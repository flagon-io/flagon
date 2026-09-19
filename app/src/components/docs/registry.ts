// Metadata for the component docs (plain data, importable from server + client).
// The live examples/code live in ./examples.tsx. Keep the slugs in sync.
//
// Components are grouped by TYPE (category) so the catalog is browsable by what a
// component is for, not one long alphabetical wall. `status` tracks coverage:
// "stable" ships today (has a component + examples); "planned" is on the roadmap
// to reach parity with the shadcn/ui catalog and renders a roadmap page.

export type ComponentStatus = "stable" | "planned";

export type ComponentCategory =
  | "forms"
  | "actions"
  | "navigation"
  | "overlays"
  | "feedback"
  | "data"
  | "charts"
  | "layout";

export type ComponentMeta = {
  name: string;
  slug: string;
  description: string;
  category: ComponentCategory;
  status: ComponentStatus;
  /** npm packages needed for the manual install path (beyond the component file). */
  dependencies?: string[];
  /** Upstream Radix primitive docs, when it wraps one. */
  radix?: string;
  /** The equivalent shadcn/ui component, for planned parity items. */
  shadcn?: string;
  /**
   * A composition/recipe page (e.g. a specific chart type) rather than an
   * installable component with its own registry item. Blocks are documented by
   * their code, not an `npx shadcn add` command.
   */
  block?: boolean;
};

// Ordered categories with a human label + one-line intent, for grouped nav and
// the catalog index.
export const categories: { id: ComponentCategory; label: string; blurb: string }[] = [
  { id: "forms", label: "Forms & inputs", blurb: "Capture and validate user input." },
  { id: "actions", label: "Buttons & actions", blurb: "Trigger operations and toggles." },
  { id: "navigation", label: "Navigation", blurb: "Move between views and sections." },
  { id: "overlays", label: "Overlays", blurb: "Layered surfaces: dialogs, menus, popovers." },
  { id: "feedback", label: "Feedback & status", blurb: "Communicate state, progress, and results." },
  { id: "data", label: "Data display", blurb: "Present content and collections." },
  { id: "charts", label: "Charts", blurb: "Composable, themeable charts on Recharts." },
  { id: "layout", label: "Layout", blurb: "Structure and space the page." },
];

const sc = (slug: string) => `https://ui.shadcn.com/docs/components/${slug}`;

export const components: ComponentMeta[] = [
  // --- Forms & inputs -------------------------------------------------------
  { name: "Input", slug: "input", category: "forms", status: "stable", description: "A styled text form field, sized on the shared control scale." },
  { name: "Input Group", slug: "input-group", category: "forms", status: "stable", description: "A text input with leading/trailing addons that share one bordered container." },
  { name: "Input OTP", slug: "input-otp", category: "forms", status: "stable", description: "A one-time-code input with per-character slots.", dependencies: ["input-otp"] },
  { name: "Money Input", slug: "money-input", category: "forms", status: "stable", description: "A currency field that understands shorthand (35k, 2.5m) and quick arithmetic." },
  { name: "Textarea", slug: "textarea", category: "forms", status: "stable", description: "A multi-line text input." },
  { name: "Label", slug: "label", category: "forms", status: "stable", description: "An accessible label for a form control." },
  { name: "Checkbox", slug: "checkbox", category: "forms", status: "stable", description: "A control that toggles between checked and unchecked.", dependencies: ["@radix-ui/react-checkbox"], radix: "https://www.radix-ui.com/primitives/docs/components/checkbox" },
  { name: "Switch", slug: "switch", category: "forms", status: "stable", description: "A toggle between an on and off state.", dependencies: ["@radix-ui/react-switch"], radix: "https://www.radix-ui.com/primitives/docs/components/switch" },
  { name: "Select", slug: "select", category: "forms", status: "stable", description: "Choose one option; adaptive (native on touch, Radix on desktop), or force native/Radix.", dependencies: ["@radix-ui/react-select"], radix: "https://www.radix-ui.com/primitives/docs/components/select" },
  { name: "Calendar", slug: "calendar", category: "forms", status: "stable", description: "A month-grid date picker for single, multiple, or range selection.", dependencies: ["react-day-picker", "date-fns"] },
  { name: "Date Field", slug: "date-field", category: "forms", status: "stable", description: "A typeable single-date input that parses many formats, with a calendar popover.", dependencies: ["react-day-picker", "date-fns"] },
  { name: "Date Range Field", slug: "date-range-field", category: "forms", status: "stable", description: "A from/to date-range picker with a two-month range calendar.", dependencies: ["react-day-picker", "date-fns"] },
  { name: "Color Input", slug: "color-input", category: "forms", status: "stable", description: "A hex field with a full HSV picker, eyedropper, and swatches." },
  { name: "Slider", slug: "slider", category: "forms", status: "stable", description: "Pick a number (or range) by dragging along a track.", dependencies: ["@radix-ui/react-slider"], radix: "https://www.radix-ui.com/primitives/docs/components/slider" },
  { name: "Radio Group", slug: "radio-group", category: "forms", status: "stable", description: "A set of mutually exclusive options.", dependencies: ["@radix-ui/react-radio-group"], radix: "https://www.radix-ui.com/primitives/docs/components/radio-group", shadcn: sc("radio-group") },
  { name: "Combobox", slug: "combobox", category: "forms", status: "stable", description: "A typeahead select with search and keyboard nav; static options or an async server search.", dependencies: ["cmdk", "@radix-ui/react-popover"], shadcn: sc("combobox") },
  { name: "Field", slug: "field", category: "forms", status: "stable", description: "A label + control + description + error wrapper for consistent form rows.", shadcn: sc("field") },

  // --- Buttons & actions ----------------------------------------------------
  { name: "Button", slug: "button", category: "actions", status: "stable", description: "A clickable button with variants and sizes." },
  { name: "Button Group", slug: "button-group", category: "actions", status: "stable", description: "A joined row of related buttons acting as a segmented control.", shadcn: sc("button-group") },
  { name: "Toggle", slug: "toggle", category: "actions", status: "stable", description: "A two-state button that stays pressed.", dependencies: ["@radix-ui/react-toggle"], radix: "https://www.radix-ui.com/primitives/docs/components/toggle", shadcn: sc("toggle") },
  { name: "Toggle Group", slug: "toggle-group", category: "actions", status: "stable", description: "A set of toggles for single or multiple selection.", dependencies: ["@radix-ui/react-toggle-group"], radix: "https://www.radix-ui.com/primitives/docs/components/toggle-group", shadcn: sc("toggle-group") },

  // --- Navigation -----------------------------------------------------------
  { name: "Tabs", slug: "tabs", category: "navigation", status: "stable", description: "Switch between related views.", dependencies: ["@radix-ui/react-tabs"], radix: "https://www.radix-ui.com/primitives/docs/components/tabs" },
  { name: "Sidebar", slug: "sidebar", category: "navigation", status: "stable", description: "Composable primitives for an application navigation sidebar." },
  { name: "Breadcrumb", slug: "breadcrumb", category: "navigation", status: "stable", description: "The trail of pages leading to the current one.", shadcn: sc("breadcrumb") },
  { name: "Pagination", slug: "pagination", category: "navigation", status: "stable", description: "Move through pages of results.", shadcn: sc("pagination") },
  { name: "Command", slug: "command", category: "navigation", status: "stable", description: "A command palette with fuzzy search.", dependencies: ["cmdk"], shadcn: sc("command") },
  { name: "Navigation Menu", slug: "navigation-menu", category: "navigation", status: "stable", description: "A top-level nav with dropdown sections.", dependencies: ["@radix-ui/react-navigation-menu"], radix: "https://www.radix-ui.com/primitives/docs/components/navigation-menu", shadcn: sc("navigation-menu") },
  { name: "Menubar", slug: "menubar", category: "navigation", status: "stable", description: "A desktop-style application menu bar.", dependencies: ["@radix-ui/react-menubar"], radix: "https://www.radix-ui.com/primitives/docs/components/menubar", shadcn: sc("menubar") },

  // --- Overlays -------------------------------------------------------------
  { name: "Dialog", slug: "dialog", category: "overlays", status: "stable", description: "A modal window overlaid on the page, with focus trapping.", dependencies: ["@radix-ui/react-dialog"], radix: "https://www.radix-ui.com/primitives/docs/components/dialog" },
  { name: "Sheet", slug: "sheet", category: "overlays", status: "stable", description: "A panel that slides in from the edge of the screen.", dependencies: ["@radix-ui/react-dialog"], radix: "https://www.radix-ui.com/primitives/docs/components/dialog" },
  { name: "Popover", slug: "popover", category: "overlays", status: "stable", description: "Rich floating content anchored to a trigger.", dependencies: ["@radix-ui/react-popover"], radix: "https://www.radix-ui.com/primitives/docs/components/popover" },
  { name: "Dropdown Menu", slug: "dropdown-menu", category: "overlays", status: "stable", description: "A menu of actions or links triggered by a button.", dependencies: ["@radix-ui/react-dropdown-menu"], radix: "https://www.radix-ui.com/primitives/docs/components/dropdown-menu" },
  { name: "Tooltip", slug: "tooltip", category: "overlays", status: "stable", description: "A hint shown on hover or focus.", dependencies: ["@radix-ui/react-tooltip"], radix: "https://www.radix-ui.com/primitives/docs/components/tooltip" },
  { name: "Alert Dialog", slug: "alert-dialog", category: "overlays", status: "stable", description: "A modal that interrupts for a confirm/cancel decision.", dependencies: ["@radix-ui/react-alert-dialog"], radix: "https://www.radix-ui.com/primitives/docs/components/alert-dialog", shadcn: sc("alert-dialog") },
  { name: "Context Menu", slug: "context-menu", category: "overlays", status: "stable", description: "A right-click menu of contextual actions.", dependencies: ["@radix-ui/react-context-menu"], radix: "https://www.radix-ui.com/primitives/docs/components/context-menu", shadcn: sc("context-menu") },
  { name: "Hover Card", slug: "hover-card", category: "overlays", status: "stable", description: "A preview card shown on hover.", dependencies: ["@radix-ui/react-hover-card"], radix: "https://www.radix-ui.com/primitives/docs/components/hover-card", shadcn: sc("hover-card") },
  { name: "Drawer", slug: "drawer", category: "overlays", status: "stable", description: "A bottom sheet that drags, great on touch.", dependencies: ["vaul"], shadcn: sc("drawer") },

  // --- Feedback & status ----------------------------------------------------
  { name: "Alert", slug: "alert", category: "feedback", status: "stable", description: "Callouts for messages that need attention, with severity-aware ARIA roles." },
  { name: "Badge", slug: "badge", category: "feedback", status: "stable", description: "Small labels for status, counts, and metadata." },
  { name: "Skeleton", slug: "skeleton", category: "feedback", status: "stable", description: "A placeholder shown while content is loading." },
  { name: "Progress", slug: "progress", category: "feedback", status: "stable", description: "A bar showing completion of a task.", dependencies: ["@radix-ui/react-progress"], radix: "https://www.radix-ui.com/primitives/docs/components/progress", shadcn: sc("progress") },
  { name: "Spinner", slug: "spinner", category: "feedback", status: "stable", description: "An indeterminate loading indicator.", shadcn: sc("spinner") },
  { name: "Toast", slug: "toast", category: "feedback", status: "stable", description: "Transient, stacked notifications (Sonner).", dependencies: ["sonner"], shadcn: sc("sonner") },
  { name: "Empty", slug: "empty", category: "feedback", status: "stable", description: "An empty-state placeholder with icon, copy, and a call to action.", shadcn: sc("empty") },

  // --- Data display ---------------------------------------------------------
  { name: "Card", slug: "card", category: "data", status: "stable", description: "A bordered container with header, content, and footer slots." },
  { name: "Avatar", slug: "avatar", category: "data", status: "stable", description: "An image element with a graceful text fallback.", dependencies: ["@radix-ui/react-avatar"], radix: "https://www.radix-ui.com/primitives/docs/components/avatar" },
  { name: "Collapsible", slug: "collapsible", category: "data", status: "stable", description: "Toggle the visibility of a section.", dependencies: ["@radix-ui/react-collapsible"], radix: "https://www.radix-ui.com/primitives/docs/components/collapsible" },
  { name: "Kbd", slug: "kbd", category: "data", status: "stable", description: "A keyboard key hint, e.g. for shortcuts." },
  { name: "Separator", slug: "separator", category: "data", status: "stable", description: "A visual or semantic divider between content.", dependencies: ["@radix-ui/react-separator"], radix: "https://www.radix-ui.com/primitives/docs/components/separator" },
  { name: "Accordion", slug: "accordion", category: "data", status: "stable", description: "Stacked, individually collapsible sections.", dependencies: ["@radix-ui/react-accordion"], radix: "https://www.radix-ui.com/primitives/docs/components/accordion", shadcn: sc("accordion") },
  { name: "Table", slug: "table", category: "data", status: "stable", description: "A styled data table primitive.", shadcn: sc("table") },
  { name: "Data Table", slug: "data-table", category: "data", status: "stable", description: "A sortable, filterable, paginated table built on TanStack Table.", dependencies: ["@tanstack/react-table"], shadcn: sc("data-table") },
  { name: "Carousel", slug: "carousel", category: "data", status: "stable", description: "A horizontally swipeable content slider.", dependencies: ["embla-carousel-react"], shadcn: sc("carousel") },
  { name: "Typography", slug: "typography", category: "data", status: "stable", description: "Prose styles for headings, lists, and long-form text.", shadcn: sc("typography") },
  { name: "Item", slug: "item", category: "data", status: "stable", description: "A flexible media-object row (icon/avatar + text + actions).", shadcn: sc("item") },

  // --- Charts ---------------------------------------------------------------
  // The Chart primitives are an installable component; each chart TYPE below is a
  // composition recipe (a `block`) documented by its code, like shadcn's charts.
  { name: "Chart", slug: "chart", category: "charts", status: "stable", description: "The container, config, tooltip, and legend every chart is built from.", dependencies: ["recharts"], shadcn: sc("chart") },
  { name: "Area Chart", slug: "area-chart", category: "charts", status: "stable", block: true, description: "A filled line chart for trends and cumulative totals.", dependencies: ["recharts"], shadcn: "https://ui.shadcn.com/charts/area" },
  { name: "Bar Chart", slug: "bar-chart", category: "charts", status: "stable", block: true, description: "Compare values across categories, grouped or stacked.", dependencies: ["recharts"], shadcn: "https://ui.shadcn.com/charts/bar" },
  { name: "Line Chart", slug: "line-chart", category: "charts", status: "stable", block: true, description: "Plot one or more series over a continuous axis.", dependencies: ["recharts"], shadcn: "https://ui.shadcn.com/charts/line" },
  { name: "Pie Chart", slug: "pie-chart", category: "charts", status: "stable", block: true, description: "Show parts of a whole, as a pie or a donut.", dependencies: ["recharts"], shadcn: "https://ui.shadcn.com/charts/pie" },
  { name: "Radar Chart", slug: "radar-chart", category: "charts", status: "stable", block: true, description: "Compare multiple quantitative axes on a shared origin.", dependencies: ["recharts"], shadcn: "https://ui.shadcn.com/charts/radar" },
  { name: "Radial Chart", slug: "radial-chart", category: "charts", status: "stable", block: true, description: "A circular progress-style bar chart for a few values.", dependencies: ["recharts"], shadcn: "https://ui.shadcn.com/charts/radial" },

  // --- Layout ---------------------------------------------------------------
  { name: "Aspect Ratio", slug: "aspect-ratio", category: "layout", status: "stable", description: "Constrain content to a fixed width/height ratio.", dependencies: ["@radix-ui/react-aspect-ratio"], radix: "https://www.radix-ui.com/primitives/docs/components/aspect-ratio", shadcn: sc("aspect-ratio") },
  { name: "Resizable", slug: "resizable", category: "layout", status: "stable", description: "Draggable, resizable panel groups.", dependencies: ["react-resizable-panels"], shadcn: sc("resizable") },
  { name: "Scroll Area", slug: "scroll-area", category: "layout", status: "stable", description: "A custom-styled, cross-browser scroll container.", dependencies: ["@radix-ui/react-scroll-area"], radix: "https://www.radix-ui.com/primitives/docs/components/scroll-area", shadcn: sc("scroll-area") },
];

export function getComponent(slug: string): ComponentMeta | undefined {
  return components.find((c) => c.slug === slug);
}

/** Components grouped by category, in category order, for grouped nav/catalog. */
export function componentsByCategory(): { category: (typeof categories)[number]; items: ComponentMeta[] }[] {
  return categories.map((category) => ({
    category,
    items: components.filter((c) => c.category === category.id),
  }));
}

export const stableCount = components.filter((c) => c.status === "stable").length;
export const totalCount = components.length;
