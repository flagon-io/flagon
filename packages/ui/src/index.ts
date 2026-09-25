// @flagon-io/ui - accessible, Radix-based React components for Flagon.
//
// Two ways to consume:
//   - Barrel import:  import { Button } from "@flagon-io/ui"
//   - Direct import:  import { Button } from "@flagon-io/ui/button"  (flowbite-style)
// Both expect the theme tokens from "@flagon-io/ui/styles.css" (or an app that
// already defines them) and a surrounding <ThemeProvider>.
export { cn } from "./lib/cn";
export { controlHeight, focusRing, focusRingInset, focusWithinRing, type ControlSize } from "./lib/control";
export { overlayClasses } from "./lib/overlay";
export {
  brandCss,
  serializeBrand,
  parseBrand,
  densityScales,
  type Brand,
  type BrandColors,
  type BrandFonts,
  type BrandDensity,
} from "./lib/brand";
export {
  brandPresets,
  flagonBrand,
  materialBrand,
  cobaltBrand,
  nocturneBrand,
  popBrand,
} from "./lib/brand-presets";
export { useIsMobile } from "./lib/use-is-mobile";

export * from "./components/accordion";
export * from "./components/alert";
export * from "./components/alert-dialog";
export * from "./components/aspect-ratio";
export * from "./components/avatar";
export * from "./components/badge";
export * from "./components/brand-provider";
export * from "./components/breadcrumb";
export * from "./components/button";
export * from "./components/button-group";
export * from "./components/calendar";
export * from "./components/card";
export * from "./components/carousel";
export * from "./components/chart";
export * from "./components/checkbox";
export * from "./components/color-input";
export * from "./components/combobox";
export * from "./components/command";
export * from "./components/data-table";
export * from "./components/date-field";
export * from "./components/date-range-field";
export * from "./components/collapsible";
export * from "./components/context-menu";
export * from "./components/dialog";
export * from "./components/drawer";
export * from "./components/dropdown-menu";
export * from "./components/empty";
export * from "./components/field";
export * from "./components/flagon-mark";
export * from "./components/hover-card";
export * from "./components/item";
export * from "./components/input";
export * from "./components/input-group";
export * from "./components/input-otp";
export * from "./components/kbd";
export * from "./components/label";
export * from "./components/menubar";
export * from "./components/money-input";
export * from "./components/navigation-menu";
export * from "./components/pagination";
export * from "./components/popover";
export * from "./components/progress";
export * from "./components/radio-group";
export * from "./components/resizable";
export * from "./components/scroll-area";
export * from "./components/select";
export * from "./components/separator";
export * from "./components/sheet";
export * from "./components/sidebar";
export * from "./components/skeleton";
export * from "./components/slider";
export * from "./components/spinner";
export * from "./components/switch";
export * from "./components/table";
export * from "./components/tabs";
export * from "./components/textarea";
export * from "./components/toast";
export * from "./components/typography";
export * from "./components/toggle";
export * from "./components/toggle-group";
export * from "./components/tooltip";
