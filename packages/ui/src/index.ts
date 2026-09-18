// @flagon-io/ui - accessible, Radix-based React components for Flagon.
//
// Two ways to consume:
//   - Barrel import:  import { Button } from "@flagon-io/ui"
//   - Direct import:  import { Button } from "@flagon-io/ui/button"  (flowbite-style)
// Both expect the theme tokens from "@flagon-io/ui/styles.css" (or an app that
// already defines them) and a surrounding <ThemeProvider>.
export { cn } from "./lib/cn";
export { useIsMobile } from "./lib/use-is-mobile";

export * from "./components/alert";
export * from "./components/avatar";
export * from "./components/badge";
export * from "./components/button";
export * from "./components/calendar";
export * from "./components/card";
export * from "./components/checkbox";
export * from "./components/date-field";
export * from "./components/collapsible";
export * from "./components/dialog";
export * from "./components/dropdown-menu";
export * from "./components/flagon-mark";
export * from "./components/input";
export * from "./components/input-group";
export * from "./components/input-otp";
export * from "./components/kbd";
export * from "./components/label";
export * from "./components/popover";
export * from "./components/select";
export * from "./components/separator";
export * from "./components/sheet";
export * from "./components/sidebar";
export * from "./components/skeleton";
export * from "./components/switch";
export * from "./components/tabs";
export * from "./components/textarea";
export * from "./components/tooltip";
