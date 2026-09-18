// Metadata for the component docs (plain data, importable from server + client).
// The live examples/code live in ./examples.tsx. Keep the slugs in sync.

export type ComponentMeta = {
  name: string;
  slug: string;
  description: string;
  /** npm packages needed for the manual install path (beyond the component file). */
  dependencies?: string[];
  /** Upstream Radix primitive docs, when it wraps one. */
  radix?: string;
};

export const components: ComponentMeta[] = [
  { name: "Alert", slug: "alert", description: "Callouts for messages that need attention, with severity-aware ARIA roles." },
  { name: "Avatar", slug: "avatar", description: "An image element with a graceful text fallback.", dependencies: ["@radix-ui/react-avatar"], radix: "https://www.radix-ui.com/primitives/docs/components/avatar" },
  { name: "Badge", slug: "badge", description: "Small labels for status, counts, and metadata." },
  { name: "Button", slug: "button", description: "A clickable button with variants and sizes." },
  { name: "Calendar", slug: "calendar", description: "A month-grid date picker for single, multiple, or range selection.", dependencies: ["react-day-picker", "date-fns"] },
  { name: "Card", slug: "card", description: "A bordered container with header, content, and footer slots." },
  { name: "Date Field", slug: "date-field", description: "A typeable date input that parses many formats, paired with a calendar popover.", dependencies: ["react-day-picker", "date-fns"] },
  { name: "Checkbox", slug: "checkbox", description: "A control that toggles between checked and unchecked.", dependencies: ["@radix-ui/react-checkbox"], radix: "https://www.radix-ui.com/primitives/docs/components/checkbox" },
  { name: "Collapsible", slug: "collapsible", description: "Toggle the visibility of a section.", dependencies: ["@radix-ui/react-collapsible"], radix: "https://www.radix-ui.com/primitives/docs/components/collapsible" },
  { name: "Dialog", slug: "dialog", description: "A modal window overlaid on the page, with focus trapping.", dependencies: ["@radix-ui/react-dialog"], radix: "https://www.radix-ui.com/primitives/docs/components/dialog" },
  { name: "Dropdown Menu", slug: "dropdown-menu", description: "A menu of actions or links triggered by a button.", dependencies: ["@radix-ui/react-dropdown-menu"], radix: "https://www.radix-ui.com/primitives/docs/components/dropdown-menu" },
  { name: "Input", slug: "input", description: "A styled text form field." },
  { name: "Kbd", slug: "kbd", description: "A keyboard key hint, e.g. for shortcuts." },
  { name: "Label", slug: "label", description: "An accessible label for a form control." },
  { name: "Popover", slug: "popover", description: "Rich floating content anchored to a trigger.", dependencies: ["@radix-ui/react-popover"], radix: "https://www.radix-ui.com/primitives/docs/components/popover" },
  { name: "Select", slug: "select", description: "Choose a single option from a list.", dependencies: ["@radix-ui/react-select"], radix: "https://www.radix-ui.com/primitives/docs/components/select" },
  { name: "Separator", slug: "separator", description: "A visual or semantic divider between content.", dependencies: ["@radix-ui/react-separator"], radix: "https://www.radix-ui.com/primitives/docs/components/separator" },
  { name: "Sheet", slug: "sheet", description: "A panel that slides in from the edge of the screen.", dependencies: ["@radix-ui/react-dialog"], radix: "https://www.radix-ui.com/primitives/docs/components/dialog" },
  { name: "Sidebar", slug: "sidebar", description: "Composable primitives for an application navigation sidebar." },
  { name: "Skeleton", slug: "skeleton", description: "A placeholder shown while content is loading." },
  { name: "Switch", slug: "switch", description: "A toggle between an on and off state.", dependencies: ["@radix-ui/react-switch"], radix: "https://www.radix-ui.com/primitives/docs/components/switch" },
  { name: "Tabs", slug: "tabs", description: "Switch between related views.", dependencies: ["@radix-ui/react-tabs"], radix: "https://www.radix-ui.com/primitives/docs/components/tabs" },
  { name: "Textarea", slug: "textarea", description: "A multi-line text input." },
  { name: "Tooltip", slug: "tooltip", description: "A hint shown on hover or focus.", dependencies: ["@radix-ui/react-tooltip"], radix: "https://www.radix-ui.com/primitives/docs/components/tooltip" },
];

export function getComponent(slug: string): ComponentMeta | undefined {
  return components.find((c) => c.slug === slug);
}
